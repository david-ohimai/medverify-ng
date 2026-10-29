/**
 * Loads the NAFDAC registry from CSV into the database, the genuine-pack
 * reference photos from prisma/seed/reference/, and makes sure every AI task
 * has a stored prompt version.
 *
 *   npm run seed              all CSVs in prisma/seed/data (real + demo)
 *   npm run seed -- --no-demo skip *.demo.csv (fictional placeholder rows)
 *
 * The CSVs are the source of truth: every row is validated first (nothing is
 * written if any row is bad), then in one transaction everything listed is
 * upserted in bulk and anything no longer listed is removed — so deleting a
 * row, or running with --no-demo after a normal seed, really takes it out.
 * Finally the registry cache is cleared. Safe to run any number of times.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearPromptCache } from "../src/ai/prompts.js";
import { AI_TASK_NAMES, AI_TASKS } from "../src/ai/tasks.js";
import { cacheDelPattern, cacheKeys } from "../src/lib/cache.js";
import { promptRepository } from "../src/repositories/prompt.repository.js";
import { referenceImageRepository } from "../src/repositories/referenceImage.repository.js";
import { loadReferenceImages } from "./seed/reference-import.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import {
  registryImportRepository,
  type BatchImportRow,
  type ProductImportRow,
} from "../src/repositories/registryImport.repository.js";
import {
  batchRow,
  checkConsistency,
  parseCsv,
  productRow,
  type BatchRow,
  type ProductRow,
} from "./seed/registry-import.js";

const DATA_DIR = fileURLToPath(new URL("./seed/data/", import.meta.url));
const REFERENCE_DIR = fileURLToPath(new URL("./seed/reference/", import.meta.url));
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

const toProduct = (p: ProductRow): ProductImportRow => ({
  nafdacNo: p.nafdac_no,
  brandName: p.brand_name,
  genericName: p.generic_name,
  strength: p.strength,
  dosageForm: p.dosage_form,
  manufacturer: p.manufacturer,
  status: p.status,
  source: p.source,
});

const toBatch = (b: BatchRow): BatchImportRow => ({
  nafdacNo: b.nafdac_no,
  batchNo: b.batch_no,
  mfgDate: b.mfg_date,
  expiryDate: b.expiry_date,
  recalled: b.recalled,
  recallNote: b.recall_note,
  source: b.source,
});

async function main(): Promise<void> {
  const products = load<ProductRow>("products", productRow);
  const batches = load<BatchRow>("batches", batchRow);
  const references = await loadReferenceImages(
    REFERENCE_DIR,
    new Map(products.rows.map((p) => [p.nafdac_no, p.source]))
  );
  const errors = [
    ...products.errors,
    ...batches.errors,
    ...checkConsistency(products.rows, batches.rows),
    ...references.errors.map((error) => `reference/${error}`),
  ];

  if (errors.length > 0) {
    console.error(`\nSeed aborted — ${errors.length} problem(s), nothing was written:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  // The CSVs replace the registry, so an empty load would empty it. Refuse.
  if (products.rows.length === 0) {
    console.error(
      `\nSeed aborted — no products found in ${DATA_DIR}${includeDemo ? "" : " (demo files skipped by --no-demo)"}.` +
        "\nRefusing to remove every product from the registry.\n"
    );
    process.exitCode = 1;
    return;
  }

  const productRows = products.rows.map(toProduct);
  const batchRows = batches.rows.map(toBatch);

  const removed = await prisma.$transaction(
    async (tx) => {
      await registryImportRepository.upsertProducts(tx, productRows);
      await registryImportRepository.upsertBatches(tx, batchRows);
      return registryImportRepository.removeUnlisted(tx, productRows, batchRows);
    },
    { timeout: 120_000 }
  );

  const cleared = await cacheDelPattern(cacheKeys.registryAll);
  const demo = productRows.filter((p) => p.source === "demo").length;
  console.log(
    `Registry seeded: ${productRows.length} products (${demo} demo), ${batchRows.length} batches. ` +
      `Removed ${removed.products} products and ${removed.batches} batches no longer in the CSVs. ` +
      `Cleared ${cleared} cached entries.`
  );

  // Product ids exist now: attach each photo to its product and sync the table to the folder.
  const ids = new Map(
    (await prisma.product.findMany({ select: { id: true, nafdacNo: true } })).map((p) => [p.nafdacNo, p.id])
  );
  const synced = await referenceImageRepository.sync(
    references.rows.map(({ nafdacNo, ...row }) => ({ ...row, productId: ids.get(nafdacNo)! }))
  );
  console.log(
    `Reference photos: ${references.rows.length} in the folder (${synced.added} added, ${synced.removed} removed).` +
      (references.skipped.length > 0 ? ` Skipped folders with no product loaded: ${references.skipped.join(", ")}.` : "")
  );

  await seedPrompts();
}

/**
 * The built-in prompt of every AI task becomes a stored version. Existing
 * versions are never changed, and a task that already has an active version
 * keeps it — so re-seeding never undoes a prompt change made through the API.
 */
async function seedPrompts(): Promise<void> {
  for (const task of AI_TASK_NAMES) {
    const { version, system, notes } = AI_TASKS[task].defaultPrompt;
    await promptRepository.ensure(task, version, system, notes);
    await clearPromptCache(task);
  }
  console.log(`Prompt versions ensured for: ${AI_TASK_NAMES.join(", ")}.`);
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
