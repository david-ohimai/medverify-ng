import type { PackSide, RegistrySource } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

export interface ReferenceImageRow {
  productId: string;
  side: PackSide;
  data: Buffer;
  width: number;
  height: number;
  sha256: string;
  fileName: string;
  source: RegistrySource;
}

/** Order the AI sees references in: front first, then back, then anything else. */
const SIDE_ORDER: PackSide[] = ["front", "back", "other"];

export const referenceImageRepository = {
  /** Up to `limit` references for a product, one per side first (front, back, other). */
  async forProduct(productId: string, limit = 2) {
    const rows = await prisma.referenceImage.findMany({
      where: { productId },
      select: { id: true, side: true, data: true, sha256: true },
      orderBy: { createdAt: "asc" },
    });
    const bySide = SIDE_ORDER.flatMap((side) => rows.filter((row) => row.side === side));
    const firstPerSide = SIDE_ORDER.map((side) => bySide.find((row) => row.side === side)).filter((row) => row !== undefined);
    const rest = bySide.filter((row) => !firstPerSide.includes(row));
    return [...firstPerSide, ...rest].slice(0, limit).map((row) => ({ ...row, data: Buffer.from(row.data) }));
  },

  /** Metadata only — for listing on a product. */
  listForProduct(productId: string) {
    return prisma.referenceImage.findMany({
      where: { productId },
      select: { id: true, side: true, width: true, height: true },
      orderBy: [{ side: "asc" }, { createdAt: "asc" }],
    });
  },

  findImage(id: string, nafdacNo: string) {
    return prisma.referenceImage.findFirst({
      where: { id, product: { nafdacNo } },
      select: { data: true, sha256: true },
    });
  },

  /** Seed: insert new photos, keep unchanged ones, remove those no longer in the folder. */
  async sync(rows: ReferenceImageRow[]): Promise<{ added: number; removed: number }> {
    return prisma.$transaction(async (tx) => {
      const keep = rows.map((row) => row.sha256);
      const { count: removed } = await tx.referenceImage.deleteMany({ where: { sha256: { notIn: keep } } });
      const existing = new Set(
        (await tx.referenceImage.findMany({ where: { sha256: { in: keep } }, select: { sha256: true } })).map((row) => row.sha256)
      );
      const fresh = rows.filter((row) => !existing.has(row.sha256));
      if (fresh.length > 0) {
        await tx.referenceImage.createMany({ data: fresh.map((row) => ({ ...row, data: new Uint8Array(row.data) })) });
      }
      return { added: fresh.length, removed };
    });
  },
};
