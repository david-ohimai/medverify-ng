import type { ReviewDecision, ReviewStatus, Verdict } from "../../generated/prisma/enums.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { appEvents } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import type { PaginationMeta } from "../../lib/response.js";
import { reviewRepository } from "../../repositories/review.repository.js";
import type { Signal } from "../risk/riskScorer.js";
import { CLAIM_TTL_MS, escalatedDeadline, IMAGE_RETENTION_DAYS, reviewNeeded, slaDeadline } from "./reviewRules.js";

export const reviewService = {
  /** Called by the scan pipeline when a photo scan is done. Queues it (with its photo) if a human should look. */
  async enqueueIfNeeded(scan: {
    id: string;
    deviceId: string | null;
    kind: "photo" | "manual";
    verdict: Verdict;
    confidence: "high" | "medium" | "low";
    signals: Signal[];
    createdAt: Date;
    image: Buffer;
  }): Promise<boolean> {
    const need = reviewNeeded(scan);
    if (!need) return false;
    const review = await reviewRepository.create({
      scanId: scan.id,
      priority: need.priority,
      reasons: need.reasons,
      slaDeadline: slaDeadline(scan.createdAt, need.priority),
      imageData: scan.image,
    });
    appEvents.emit("review:queued", { reviewId: review.id, scanId: scan.id, priority: need.priority, reasons: need.reasons });
    return true;
  },

  async list(status: ReviewStatus | undefined, page: number, limit: number) {
    const { items, total } = await reviewRepository.list(status, page, limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const meta: PaginationMeta = { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
    const now = Date.now();
    return { items: items.map((item) => ({ ...item, overdue: item.status !== "decided" && item.slaDeadline.getTime() < now })), meta };
  },

  async get(id: string) {
    const review = await reviewRepository.findDetail(id);
    if (!review) throw new NotFoundError("Review not found");
    return review;
  },

  async image(id: string): Promise<Buffer> {
    const image = await reviewRepository.findImage(id);
    if (!image) throw new NotFoundError("No photo for this review (decided, or older than 7 days)");
    return image;
  },

  async claim(id: string, reviewerId: string) {
    if (!(await reviewRepository.claim(id, reviewerId, new Date(), CLAIM_TTL_MS))) {
      const current = await reviewRepository.findStatus(id);
      if (!current) throw new NotFoundError("Review not found");
      throw new ConflictError(current.status === "decided" ? "This review has already been decided" : "Another reviewer is working on this");
    }
    appEvents.emit("review:claimed", { reviewId: id, reviewerId });
    return this.get(id);
  },

  async decide(id: string, reviewerId: string, input: { decision: ReviewDecision; reviewedVerdict?: Verdict | undefined; note?: string | undefined }) {
    if (input.decision === "disagree" && !input.reviewedVerdict) {
      throw new ValidationError([{ field: "body.reviewedVerdict", message: "Say what the verdict should be" }]);
    }
    if (input.decision !== "disagree" && input.reviewedVerdict) {
      throw new ValidationError([{ field: "body.reviewedVerdict", message: "Only set a verdict when you disagree" }]);
    }
    const decided = await reviewRepository.decide(id, reviewerId, {
      decision: input.decision,
      reviewedVerdict: input.reviewedVerdict ?? null,
      reviewerNote: input.note ?? null,
    });
    if (!decided) {
      const current = await reviewRepository.findStatus(id);
      if (!current) throw new NotFoundError("Review not found");
      throw new ConflictError(current.status === "decided" ? "This review has already been decided" : "Claim the review before deciding it");
    }
    const review = await this.get(id);
    appEvents.emit("review:decided", {
      reviewId: id,
      scanId: review.scanId,
      reviewerId,
      decision: input.decision,
      aiVerdict: review.scan.verdict,
      reviewedVerdict: input.reviewedVerdict ?? null,
    });
    return review;
  },

  /**
   * The SLA job (every 5 minutes): escalate overdue reviews, return lapsed
   * claims to the queue, delete photos past the retention window.
   */
  async maintain(now = new Date()) {
    const escalated = await reviewRepository.escalateOverdue(now, (priority) => escalatedDeadline(now, priority));
    for (const review of escalated) {
      appEvents.emit("review:escalated", { reviewId: review.id, scanId: review.scanId, priority: review.priority, level: review.escalationLevel });
    }
    const released = await reviewRepository.releaseStaleClaims(new Date(now.getTime() - CLAIM_TTL_MS));
    const purged = await reviewRepository.purgeImages(new Date(now.getTime() - IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
    const summary = { escalated: escalated.length, released: released.count, photosDeleted: purged.count };
    if (summary.escalated + summary.released + summary.photosDeleted > 0) logger.info({ event: "review:maintained", ...summary }, "Review queue maintained");
    return summary;
  },

  /** Queue health and how often people agree with the system — a live accuracy signal. */
  async stats() {
    const { byStatus, overdue, decided } = await reviewRepository.stats();
    const count = (status: string, priority?: number) =>
      byStatus.filter((row) => row.status === status && (priority === undefined || row.priority === priority)).reduce((n, row) => n + row._count._all, 0);
    return {
      open: { total: count("open") + count("claimed"), urgent: count("open", 1) + count("claimed", 1), overdue },
      decided: {
        total: decided.decisions,
        agreementRate: decided.decisions - decided.inconclusive > 0 ? Math.round((100 * decided.agreed) / (decided.decisions - decided.inconclusive)) : null,
        agreed: decided.agreed,
        disagreed: decided.disagreed,
        inconclusive: decided.inconclusive,
        medianMinutesToDecision: decided.medianMinutes === null ? null : Math.round(decided.medianMinutes),
      },
    };
  },
};
