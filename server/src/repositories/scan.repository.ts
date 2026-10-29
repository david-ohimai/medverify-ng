import type { Prisma } from "../generated/prisma/client.js";
import type { Confidence, ScanKind, Verdict } from "../generated/prisma/enums.js";
import type { ScanLocation } from "../lib/areas.js";
import { prisma } from "../lib/prisma.js";
import { productSelect } from "./product.repository.js";

const scanSelect = {
  id: true,
  kind: true,
  status: true,
  nafdacNo: true,
  productName: true,
  batchNo: true,
  expiryDate: true,
  verdict: true,
  riskScore: true,
  confidence: true,
  signals: true,
  failureCode: true,
  areaName: true,
  createdAt: true,
  completedAt: true,
  product: { select: productSelect },
} as const;

export type ScanRecord = NonNullable<Awaited<ReturnType<typeof scanRepository.findForDevice>>>;

export interface ScanOutcome {
  nafdacNo: string | null;
  productName: string | null;
  batchNo: string | null;
  expiryDate: Date | null;
  productId: string | null;
  verdict: Verdict;
  riskScore: number;
  confidence: Confidence;
  signals: Prisma.InputJsonValue;
}

export const scanRepository = {
  /** A manual check: verdict known at once. */
  create({ location, ...data }: ScanOutcome & { deviceId: string; kind: ScanKind; location: ScanLocation | null }) {
    return prisma.scan.create({ data: { ...data, ...location, completedAt: new Date() }, select: scanSelect });
  },

  /** A photo scan, accepted and waiting for the worker. */
  createPending({ location, ...data }: { deviceId: string; imageHash: string; location: ScanLocation | null }) {
    return prisma.scan.create({ data: { ...data, ...location, kind: "photo", status: "pending" }, select: scanSelect });
  },

  /** What the worker needs; any device. */
  findForWorker(id: string) {
    return prisma.scan.findUnique({ where: { id }, select: { id: true, deviceId: true, status: true, imageHash: true } });
  },

  /**
   * pending → processing, only once: a retried or duplicate job that finds
   * the scan already finished does nothing. A scan stuck in "processing"
   * (worker crashed mid-job) may be picked up again.
   */
  async claim(id: string): Promise<boolean> {
    const { count } = await prisma.scan.updateMany({
      where: { id, status: { in: ["pending", "processing"] } },
      data: { status: "processing" },
    });
    return count === 1;
  },

  complete(id: string, outcome: ScanOutcome & { extracted: Prisma.InputJsonValue; llmProvider: string }) {
    return prisma.scan.update({
      where: { id },
      data: { ...outcome, status: "done", failureCode: null, completedAt: new Date() },
      select: scanSelect,
    });
  },

  /** Only an unfinished scan can fail — a late failure never overwrites a verdict. */
  async fail(id: string, failureCode: string, extracted?: Prisma.InputJsonValue): Promise<boolean> {
    const { count } = await prisma.scan.updateMany({
      where: { id, status: { in: ["pending", "processing"] } },
      data: { status: "failed", failureCode, completedAt: new Date(), ...(extracted ? { extracted } : {}) },
    });
    return count === 1;
  },

  /** Simulated pilot data: replaced as a whole by `npm run simulate`. */
  async replaceSimulated(rows: Prisma.ScanCreateManyInput[]): Promise<{ removed: number; added: number }> {
    return prisma.$transaction(async (tx) => {
      const { count: removed } = await tx.scan.deleteMany({ where: { simulated: true } });
      const { count: added } = await tx.scan.createMany({ data: rows.map((row) => ({ ...row, simulated: true })) });
      return { removed, added };
    });
  },

  /** A device only ever sees its own scans. */
  findForDevice(id: string, deviceId: string) {
    return prisma.scan.findFirst({ where: { id, deviceId }, select: scanSelect });
  },

  /** Page and total in parallel — two queries, no N+1. */
  async listForDevice(deviceId: string, page: number, limit: number) {
    const where = { deviceId };
    const [items, total] = await Promise.all([
      prisma.scan.findMany({
        where,
        select: scanSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scan.count({ where }),
    ]);
    return { items, total };
  },
};
