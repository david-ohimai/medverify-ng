import type { ReviewDecision, ReviewStatus, Verdict } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { productSelect } from "./product.repository.js";

const reviewListSelect = {
  id: true,
  scanId: true,
  status: true,
  priority: true,
  reasons: true,
  slaDeadline: true,
  escalationLevel: true,
  claimedBy: true,
  claimedAt: true,
  decision: true,
  reviewedVerdict: true,
  decidedAt: true,
  createdAt: true,
  scan: {
    select: {
      verdict: true,
      riskScore: true,
      confidence: true,
      nafdacNo: true,
      productName: true,
      batchNo: true,
      areaName: true,
    },
  },
} as const;

export const reviewRepository = {
  create(data: { scanId: string; priority: number; reasons: string[]; slaDeadline: Date; imageData: Buffer }) {
    return prisma.scanReview.create({
      data: { ...data, imageData: new Uint8Array(data.imageData) },
      select: { id: true, priority: true, slaDeadline: true },
    });
  },

  /** The queue: most urgent first, then the nearest deadline. */
  async list(status: ReviewStatus | undefined, page: number, limit: number) {
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.scanReview.findMany({
        where,
        select: reviewListSelect,
        orderBy: [{ escalationLevel: "desc" }, { priority: "asc" }, { slaDeadline: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scanReview.count({ where }),
    ]);
    return { items, total };
  },

  /** Everything a reviewer needs: what the AI read, every signal, the registry match. */
  findDetail(id: string) {
    return prisma.scanReview.findUnique({
      where: { id },
      select: {
        ...reviewListSelect,
        reviewerNote: true,
        scan: {
          select: {
            ...reviewListSelect.scan.select,
            id: true,
            kind: true,
            expiryDate: true,
            signals: true,
            extracted: true,
            llmProvider: true,
            createdAt: true,
            product: { select: { ...productSelect, referenceImages: { select: { id: true, side: true } } } },
          },
        },
      },
    });
  },

  async findImage(id: string): Promise<Buffer | null> {
    const row = await prisma.scanReview.findUnique({ where: { id }, select: { imageData: true } });
    return row?.imageData ? Buffer.from(row.imageData) : null;
  },

  /**
   * Atomic claim: succeeds only if the review is open, already this
   * reviewer's, or its previous claim has lapsed — two reviewers can never
   * hold the same review.
   */
  async claim(id: string, reviewerId: string, now: Date, claimTtlMs: number): Promise<boolean> {
    const { count } = await prisma.scanReview.updateMany({
      where: {
        id,
        OR: [
          { status: "open" },
          { status: "claimed", claimedBy: reviewerId },
          { status: "claimed", claimedAt: { lt: new Date(now.getTime() - claimTtlMs) } },
        ],
      },
      data: { status: "claimed", claimedBy: reviewerId, claimedAt: now },
    });
    return count === 1;
  },

  /** Only the reviewer holding the claim can decide. The photo is deleted with the decision. */
  async decide(
    id: string,
    reviewerId: string,
    data: { decision: ReviewDecision; reviewedVerdict: Verdict | null; reviewerNote: string | null }
  ): Promise<boolean> {
    const { count } = await prisma.scanReview.updateMany({
      where: { id, status: "claimed", claimedBy: reviewerId },
      data: { ...data, status: "decided", decidedBy: reviewerId, decidedAt: new Date(), imageData: null },
    });
    return count === 1;
  },

  findStatus(id: string) {
    return prisma.scanReview.findUnique({ where: { id }, select: { status: true, claimedBy: true, scanId: true } });
  },

  /** Overdue and undecided: bump the level and set the next deadline. Returns what was escalated. */
  escalateOverdue(now: Date, nextDeadline: (priority: number) => Date) {
    return prisma.$transaction(async (tx) => {
      const overdue = await tx.scanReview.findMany({
        where: { status: { in: ["open", "claimed"] }, slaDeadline: { lt: now } },
        select: { id: true, priority: true, escalationLevel: true, scanId: true },
      });
      for (const review of overdue) {
        await tx.scanReview.update({
          where: { id: review.id },
          data: { escalationLevel: { increment: 1 }, slaDeadline: nextDeadline(review.priority) },
        });
      }
      return overdue.map((review) => ({ ...review, escalationLevel: review.escalationLevel + 1 }));
    });
  },

  /** Lapsed claims go back to the queue. */
  releaseStaleClaims(before: Date) {
    return prisma.scanReview.updateMany({
      where: { status: "claimed", claimedAt: { lt: before } },
      data: { status: "open", claimedBy: null, claimedAt: null },
    });
  },

  /** Photos are never kept past the retention window, decided or not. */
  purgeImages(olderThan: Date) {
    return prisma.scanReview.updateMany({
      where: { createdAt: { lt: olderThan }, imageData: { not: null } },
      data: { imageData: null },
    });
  },

  /** "Delete my data": the photos of this device's scans go, even mid-review. */
  deletePhotosForDevice(deviceId: string) {
    return prisma.scanReview.updateMany({ where: { scan: { deviceId }, imageData: { not: null } }, data: { imageData: null } });
  },

  async stats() {
    const [byStatus, overdue, decided] = await Promise.all([
      prisma.scanReview.groupBy({ by: ["status", "priority"], _count: { _all: true } }),
      prisma.scanReview.count({ where: { status: { in: ["open", "claimed"] }, escalationLevel: { gt: 0 } } }),
      prisma.$queryRaw<Array<{ decisions: number; agreed: number; disagreed: number; inconclusive: number; medianMinutes: number | null }>>`
        SELECT COUNT(*)::int AS decisions,
               COUNT(*) FILTER (WHERE decision = 'agree')::int AS agreed,
               COUNT(*) FILTER (WHERE decision = 'disagree')::int AS disagreed,
               COUNT(*) FILTER (WHERE decision = 'inconclusive')::int AS inconclusive,
               (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM decided_at - created_at) / 60))::float8 AS "medianMinutes"
        FROM scan_reviews WHERE status = 'decided'`,
    ]);
    return { byStatus, overdue, decided: decided[0]! };
  },
};
