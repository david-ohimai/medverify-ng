import type { Prisma } from "../generated/prisma/client.js";
import type { Confidence, ScanKind, Verdict } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { productSelect } from "./product.repository.js";

const scanSelect = {
  id: true,
  kind: true,
  nafdacNo: true,
  productName: true,
  batchNo: true,
  expiryDate: true,
  verdict: true,
  riskScore: true,
  confidence: true,
  signals: true,
  createdAt: true,
  product: { select: productSelect },
} as const;

export type ScanRecord = NonNullable<Awaited<ReturnType<typeof scanRepository.findForDevice>>>;

export const scanRepository = {
  create(data: {
    deviceId: string;
    kind: ScanKind;
    nafdacNo: string | null;
    productName: string | null;
    batchNo: string | null;
    expiryDate: Date | null;
    productId: string | null;
    verdict: Verdict;
    riskScore: number;
    confidence: Confidence;
    signals: Prisma.InputJsonValue;
  }) {
    return prisma.scan.create({ data, select: scanSelect });
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
