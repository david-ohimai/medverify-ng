/**
 * Simulated pilot data for the hotspot map: ~1,400 scans over the last 30
 * days around Nigerian markets, with planted clusters of suspicious scans.
 *
 *   npm run simulate            replace all simulated scans, then cluster
 *   npm run simulate -- --clear remove them only
 *
 * Every row has simulated = true, no device, and the API flags any hotspot
 * built from them (includesSimulatedData). Verdicts come from the real
 * registry rules (registrySignals + assessRisk) over the demo registry, so
 * the data is consistent with what a real scan would produce. Deterministic:
 * the same seed gives the same scans (shifted to "now").
 *
 * Planted (last 7 days unless noted):
 *   Idumota market, Lagos      recalled batch DQ2310 of Demoquine     → high
 *   Bridgehead market, Onitsha unregistered number X9-0999            → high
 *   Sabon Gari market, Kano    X9-0001 printed on another product     → medium
 *   Ariaria market, Aba        expired batch DQ2299, 20–25 days ago   → outside the 7-day window
 */
import { AREAS, nearestAreaName, roundCoordinate, type Area } from "../src/lib/areas.js";
import { parseExpiry, todayUtc } from "../src/lib/dates.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { productRepository } from "../src/repositories/product.repository.js";
import { scanRepository } from "../src/repositories/scan.repository.js";
import { hotspotService } from "../src/services/hotspot/hotspot.service.js";
import { registrySignals } from "../src/services/risk/registrySignals.js";
import { assessRisk } from "../src/services/risk/riskScorer.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import "../src/events/index.js";

const DAYS = 30;
const BACKGROUND_PER_DAY = 45;
const HOUR = 60 * 60 * 1000;

/** mulberry32: a tiny seeded PRNG, so every run plants the same data. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const random = rng(20261031);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const area = (name: string): Area => AREAS.find((a) => a.name === name)!;

/** A point within `km` of an area's centre (uniform in the disc). */
function near(place: Area, km: number): { latitude: number; longitude: number } {
  const r = (km / 111) * Math.sqrt(random());
  const theta = random() * 2 * Math.PI;
  return {
    latitude: roundCoordinate(place.latitude + r * Math.cos(theta)),
    longitude: roundCoordinate(place.longitude + (r * Math.sin(theta)) / Math.cos((place.latitude * Math.PI) / 180)),
  };
}

interface Facts {
  nafdacNo: string;
  productName: string;
  batchNo: string | null;
  /** "YYYY-MM" as printed. */
  expiry: string | null;
}

/** The demo registry, looked up once. */
async function loadRegistry() {
  const numbers = ["X9-0001", "X9-0002", "X9-0003", "X9-0004", "X9-0005"];
  const products = new Map<string, NonNullable<Awaited<ReturnType<typeof productRepository.findByNafdacNo>>>>();
  for (const nafdacNo of numbers) {
    const product = await productRepository.findByNafdacNo(nafdacNo);
    if (product) products.set(nafdacNo, product);
  }
  if (products.size === 0) throw new Error("Demo registry not found, run `npm run seed` first (without --no-demo).");
  return products;
}

const GENUINE: Facts[] = [
  { nafdacNo: "X9-0001", productName: "Demoquine", batchNo: "DQ2401", expiry: "2027-08" },
  { nafdacNo: "X9-0002", productName: "Demoxil", batchNo: "DX2405", expiry: "2027-04" },
  { nafdacNo: "X9-0003", productName: "Paramed Demo", batchNo: "PM2402", expiry: "2027-01" },
  { nafdacNo: "X9-0005", productName: "Oralyte Demo", batchNo: null, expiry: null },
];
/** Scattered suspicious scans in the background noise. */
const NOISE: Facts[] = [
  { nafdacNo: "X9-0004", productName: "Ciproxa Demo", batchNo: null, expiry: null }, // cancelled registration
  { nafdacNo: "X9-0773", productName: "Malacure", batchNo: "MC9001", expiry: "2027-11" }, // unregistered
];
const RECALLED: Facts = { nafdacNo: "X9-0001", productName: "Demoquine", batchNo: "DQ2310", expiry: "2027-09" };
const UNREGISTERED: Facts = { nafdacNo: "X9-0999", productName: "Curamax", batchNo: "CX0001", expiry: "2027-12" };
const CLONED: Facts = { nafdacNo: "X9-0001", productName: "Paramed Demo", batchNo: "PM2402", expiry: "2027-01" };
const EXPIRED: Facts = { nafdacNo: "X9-0001", productName: "Demoquine", batchNo: "DQ2299", expiry: "2025-02" };

async function main(): Promise<void> {
  if (process.argv.includes("--clear")) {
    const { removed } = await scanRepository.replaceSimulated([]);
    console.log(`Removed ${removed} simulated scans.`);
    console.log(await hotspotService.refresh());
    return;
  }

  const registry = await loadRegistry();
  const batches = new Map<string, Awaited<ReturnType<typeof productRepository.findBatch>>>();
  const findBatch = async (productId: string, batchNo: string) => {
    const key = `${productId}:${batchNo}`;
    if (!batches.has(key)) batches.set(key, await productRepository.findBatch(productId, batchNo));
    return batches.get(key) ?? null;
  };
  const now = Date.now();
  const rows: Prisma.ScanCreateManyInput[] = [];

  async function scan(facts: Facts, place: Area, spreadKm: number, at: number): Promise<void> {
    const product = registry.get(facts.nafdacNo) ?? null;
    const batch = product && facts.batchNo ? await findBatch(product.id, facts.batchNo) : null;
    const nameSimilarity = product ? (product.brandName === facts.productName ? 1 : 0.1) : null;
    const kind = random() < 0.7 ? "photo" : "manual";
    const createdAt = new Date(at);
    const printedExpiry = facts.expiry ? parseExpiry(facts.expiry) : null;
    const signals = registrySignals({
      nafdacNo: facts.nafdacNo,
      product,
      nameSimilarity,
      batchNo: facts.batchNo,
      batch,
      printedExpiry,
      packNotSeen: kind === "manual",
      today: todayUtc(createdAt),
    });
    const { verdict, riskScore, confidence } = assessRisk(signals);
    const point = near(place, spreadKm);
    rows.push({
      kind,
      status: "done",
      nafdacNo: facts.nafdacNo,
      productName: facts.productName,
      batchNo: facts.batchNo,
      expiryDate: printedExpiry,
      productId: product?.id ?? null,
      verdict,
      riskScore,
      confidence,
      signals: signals as unknown as Prisma.InputJsonValue,
      ...point,
      areaName: nearestAreaName(point.latitude, point.longitude),
      createdAt,
      completedAt: createdAt,
    });
  }

  // Background: mostly genuine scans everywhere, a few scattered suspicious ones.
  for (let day = 0; day < DAYS; day++) {
    for (let i = 0; i < BACKGROUND_PER_DAY; i++) {
      const at = now - day * 24 * HOUR - random() * 24 * HOUR;
      await scan(random() < 0.97 ? pick(GENUINE) : pick(NOISE), pick(AREAS), 4, at);
    }
  }
  // Planted clusters.
  for (let i = 0; i < 18; i++) await scan(RECALLED, area("Idumota market"), 0.8, now - random() * 3 * 24 * HOUR);
  for (let i = 0; i < 12; i++) await scan(UNREGISTERED, area("Bridgehead market"), 0.8, now - random() * 5 * 24 * HOUR);
  for (let i = 0; i < 8; i++) await scan(CLONED, area("Sabon Gari market"), 0.8, now - random() * 6 * 24 * HOUR);
  for (let i = 0; i < 10; i++) await scan(EXPIRED, area("Ariaria market"), 0.8, now - (20 + random() * 5) * 24 * HOUR);

  const { removed, added } = await scanRepository.replaceSimulated(rows);
  const flagged = rows.filter((row) => (row.riskScore ?? 0) >= 30).length;
  console.log(`Simulated scans: removed ${removed}, added ${added} (${flagged} flagged) over ${DAYS} days.`);

  const summary = await hotspotService.refresh();
  console.log(`Hotspots: ${summary.clusters} cluster(s), ${summary.appeared} new, ${summary.continued} continued, ${summary.resolved} resolved, ${summary.alerts} alert(s) written.`);
}

main()
  .catch((err: unknown) => {
    console.error("Simulation failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Let the audit listeners finish writing before disconnecting.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
