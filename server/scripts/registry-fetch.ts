/**
 * Downloads the public NAFDAC Greenbook into prisma/seed/data/products.csv,
 * so any registered medicine can be checked, not just the demo rows.
 *
 *   npm run registry:fetch
 *   npm run seed
 *
 * The CSV is committed, so every change to the register is reviewable in a
 * diff. Pages are fetched one at a time with a pause, to be gentle on the site.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { dedupe, toCsv, toProduct, type GreenbookRecord } from "../prisma/seed/greenbook.js";

const SITE = "https://greenbook.nafdac.gov.ng/";
const OUTPUT = fileURLToPath(new URL("../prisma/seed/data/products.csv", import.meta.url));
const USER_AGENT = "MedVerifyNG-RegistryImport/1.0 (+https://github.com/david-ohimai/medverify-ng)";
const PAGE_SIZE = 500;
const PAUSE_MS = 1_500;
const ATTEMPTS = 4;

const pageSchema = z.object({
  recordsTotal: z.number(),
  data: z.array(z.looseObject({})),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(start: number): Promise<z.infer<typeof pageSchema>> {
  const url = `${SITE}?draw=1&start=${start}&length=${PAGE_SIZE}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return pageSchema.parse(await response.json());
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
      console.warn(`  retrying offset ${start} (${String(error)})`);
      await sleep(PAUSE_MS * 2 ** attempt);
    }
  }
}

async function main(): Promise<void> {
  const records: GreenbookRecord[] = [];
  let total = Infinity;
  while (records.length < total) {
    const page = await fetchPage(records.length);
    total = page.recordsTotal;
    if (page.data.length === 0) break;
    records.push(...(page.data as GreenbookRecord[]));
    console.log(`${records.length} / ${total}`);
    await sleep(PAUSE_MS);
  }
  if (records.length < total) throw new Error(`Only ${records.length} of ${total} records arrived; keeping the old CSV.`);

  const usable = records.map(toProduct).filter((product) => product !== null);
  const products = dedupe(usable);
  writeFileSync(OUTPUT, toCsv(products, new Date().toISOString().slice(0, 10)));

  const active = products.filter((product) => product.status === "active").length;
  console.log(`\n${records.length} Greenbook records`);
  console.log(`${records.length - usable.length} skipped (no valid NAFDAC number, no name, or deleted)`);
  console.log(`${usable.length - products.length} repeated numbers merged`);
  console.log(`${products.length} products written (${active} active). Now run: npm run seed`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
