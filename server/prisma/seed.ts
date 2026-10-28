/**
 * Loads the NAFDAC registry from CSV into the database.
 *
 *   npm run seed              all CSVs in prisma/seed/data (real + demo)
 *   npm run seed -- --no-demo skip *.demo.csv (fictional placeholder rows)
 *
 * Validates every row first and writes nothing if any row is invalid, then
 * upserts everything in one transaction, so it is safe to run again after
 * editing the CSVs. Finally clears the registry cache.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheDelPattern, cacheKeys } from "../src/lib/cache.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import {
  batchRow,
  checkConsistency,
  parseCsv,
  productRow,
  type BatchRow,
  type ProductRow,
} from "./seed/registry-import.js";

const DATA_DIR = fileURLToPath(new URL("./seed/data/", import.meta.url));
const includeDemo = !process.argv.includes("--no-demo");

function csvFiles(kind: "products" | "batches"): string[] {
  return readdirSync(DATA_DIR)
    .filter((name) => new RegExp(`^${kind}(\\..+)?\\.csv$`).test(name))
    .filter((name) => !name.includes(".template."))
    .filter((name) => includeDemo || !name.includes(".demo."))
    .sort();
}

function load<T>(kind: "products" | "batches", schema: Parameters<typeof parseCsv<T>>[2]) {
  const rows: T[] = [];
  const errors: string[] = [];
  for (const file of csvFiles(kind)) {
    const result = parseCsv(file, readFileSync(join(DATA_DIR, file), "utf8"), schema);
    rows.push(...result.rows);
    errors.push(...result.errors);
  }
  return { rows, errors };
}

async function main(): Promise<void> {
  const products = load<ProductRow>("products", productRow);
  const batches = load<BatchRow>("batches", batchRow);
  const errors = [...products.errors, ...batches.errors, ...checkConsistency(products.rows, batches.rows)];

  if (errors.length > 0) {
    console.error(`\nSeed aborted — ${errors.length} problem(s), nothing was written:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const ids = new Map<string, string>();
      for (const p of products.rows) {
        const data = {
          nafdacNo: p.nafdac_no,
          brandName: p.brand_name,
          genericName: p.generic_name,
          strength: p.strength,
          dosageForm: p.dosage_form,
          manufacturer: p.manufacturer,
          status: p.status,
          source: p.source,
        };
        const saved = await tx.product.upsert({
          where: { nafdacNo: p.nafdac_no },
          create: data,
          update: data,
          select: { id: true },
        });
        ids.set(p.nafdac_no, saved.id);
      }

      for (const b of batches.rows) {
        const productId = ids.get(b.nafdac_no)!;
        const data = {
          mfgDate: b.mfg_date,
          expiryDate: b.expiry_date,
          recalled: b.recalled,
          recallNote: b.recall_note,
          source: b.source,
        };
        await tx.batch.upsert({
          where: { productId_batchNo: { productId, batchNo: b.batch_no } },
          create: { productId, batchNo: b.batch_no, ...data },
          update: data,
        });
      }
    },
    { timeout: 60_000 }
  );

  const cleared = await cacheDelPattern(cacheKeys.registryAll);
  const demo = products.rows.filter((p) => p.source === "demo").length;
  console.log(
    `Registry seeded: ${products.rows.length} products (${demo} demo), ${batches.rows.length} batches. ` +
      `Cleared ${cleared} cached entries.`
  );
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
