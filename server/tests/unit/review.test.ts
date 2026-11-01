import { beforeEach, describe, expect, it, vi } from "vitest";
import { appEvents } from "../../src/lib/events.js";
import { reviewRepository } from "../../src/repositories/review.repository.js";
import { reviewService } from "../../src/services/review/review.service.js";
import { escalatedDeadline, finalVerdict, reviewNeeded, slaDeadline } from "../../src/services/review/reviewRules.js";
import type { Signal, SignalCode } from "../../src/services/risk/riskScorer.js";

vi.mock("../../src/repositories/review.repository.js", () => ({
  reviewRepository: {
    create: vi.fn().mockResolvedValue({ id: "r-1" }),
    claim: vi.fn(),
    decide: vi.fn(),
    findStatus: vi.fn(),
    findDetail: vi.fn(),
    escalateOverdue: vi.fn(),
    releaseStaleClaims: vi.fn(),
    purgeImages: vi.fn(),
  },
}));

const repo = vi.mocked(reviewRepository);
const signal = (code: SignalCode, weight = 0): Signal => ({ code, label: code, weight, severity: "info" });
const scan = (overrides: Partial<Parameters<typeof reviewNeeded>[0]> = {}) => ({
  kind: "photo" as const,
  verdict: "likely_genuine" as const,
  confidence: "high" as const,
  signals: [] as Signal[],
  ...overrides,
});

describe("reviewNeeded, which scans a human must see", () => {
  it("P1 (4 h) when the scan says don't take it", () => {
    expect(reviewNeeded(scan({ verdict: "high_risk" }))).toEqual({ priority: 1, reasons: ["HIGH_RISK"], slaHours: 4 });
    expect(reviewNeeded(scan({ verdict: "unregistered", confidence: "low" }))).toEqual({
      priority: 1,
      reasons: ["UNREGISTERED", "LOW_CONFIDENCE"],
      slaHours: 4,
    });
  });

  it("P2 (24 h) when suspicious, with the photo doubts listed", () => {
    expect(reviewNeeded(scan({ verdict: "suspicious", signals: [signal("TEXT_ANOMALIES", 20), signal("VISUAL_MISMATCH", 30)] }))).toEqual({
      priority: 2,
      reasons: ["SUSPICIOUS", "TEXT_ANOMALIES", "VISUAL_MISMATCH"],
      slaHours: 24,
    });
  });

  it("P3 (48 h) when 'likely genuine' but the photo raised a doubt, where a fake could slip through", () => {
    expect(reviewNeeded(scan({ signals: [signal("POOR_IMAGE")] }))).toMatchObject({ priority: 3, reasons: ["GENUINE_BUT_DOUBTFUL", "POOR_IMAGE"] });
  });

  it("a clean genuine scan, or any typed-in check, is not queued", () => {
    expect(reviewNeeded(scan({ signals: [signal("BATCH_KNOWN", -10), signal("VISUAL_MATCH", -20)] }))).toBeNull();
    expect(reviewNeeded(scan({ kind: "manual", verdict: "high_risk" }))).toBeNull();
  });
});

describe("deadlines and the final verdict", () => {
  const t0 = new Date("2026-10-30T08:00:00Z");

  it("SLA from the scan time; an escalation sets half the SLA again", () => {
    expect(slaDeadline(t0, 1).toISOString()).toBe("2026-10-30T12:00:00.000Z");
    expect(slaDeadline(t0, 3).toISOString()).toBe("2026-11-01T08:00:00.000Z");
    expect(escalatedDeadline(t0, 1).toISOString()).toBe("2026-10-30T10:00:00.000Z");
  });

  it("the reviewer's verdict wins only when they disagree", () => {
    expect(finalVerdict("suspicious", { decision: "disagree", reviewedVerdict: "high_risk" })).toBe("high_risk");
    expect(finalVerdict("suspicious", { decision: "agree", reviewedVerdict: null })).toBe("suspicious");
    expect(finalVerdict("suspicious", null)).toBe("suspicious");
  });
});

describe("reviewService", () => {
  beforeEach(() => {
    repo.findDetail.mockResolvedValue({ scanId: "s-1", scan: { verdict: "suspicious" } } as never);
  });

  it("queues a scan with its photo and the right deadline, and emits review:queued", async () => {
    const listener = vi.fn();
    appEvents.once("review:queued", listener);
    const queued = await reviewService.enqueueIfNeeded({
      id: "s-1",
      deviceId: "d-1",
      kind: "photo",
      verdict: "high_risk",
      confidence: "high",
      signals: [],
      createdAt: new Date("2026-10-30T08:00:00Z"),
      image: Buffer.from("jpeg"),
    });
    expect(queued).toBe(true);
    expect(repo.create).toHaveBeenCalledWith({
      scanId: "s-1",
      priority: 1,
      reasons: ["HIGH_RISK"],
      slaDeadline: new Date("2026-10-30T12:00:00Z"),
      imageData: Buffer.from("jpeg"),
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ reviewId: "r-1", priority: 1 }));
  });

  it("a review someone else holds → 409; an unknown one → 404", async () => {
    repo.claim.mockResolvedValue(false);
    repo.findStatus.mockResolvedValueOnce({ status: "claimed", claimedBy: "other", scanId: "s-1" });
    await expect(reviewService.claim("r-1", "me")).rejects.toMatchObject({ statusCode: 409, message: "Another reviewer is working on this" });
    repo.findStatus.mockResolvedValueOnce(null);
    await expect(reviewService.claim("r-x", "me")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("disagree needs a verdict; agree mustn't have one; nothing is saved when invalid", async () => {
    await expect(reviewService.decide("r-1", "me", { decision: "disagree" })).rejects.toMatchObject({ statusCode: 422 });
    await expect(reviewService.decide("r-1", "me", { decision: "agree", reviewedVerdict: "high_risk" })).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("deciding without holding the claim → 409", async () => {
    repo.decide.mockResolvedValue(false);
    repo.findStatus.mockResolvedValue({ status: "open", claimedBy: null, scanId: "s-1" });
    await expect(reviewService.decide("r-1", "me", { decision: "agree" })).rejects.toMatchObject({ message: "Claim the review before deciding it" });
  });

  it("a decision is recorded against what the system said (accountability trail)", async () => {
    repo.decide.mockResolvedValue(true);
    const listener = vi.fn();
    appEvents.once("review:decided", listener);
    await reviewService.decide("r-1", "me", { decision: "disagree", reviewedVerdict: "high_risk", note: "Logo differs" });
    expect(repo.decide).toHaveBeenCalledWith("r-1", "me", { decision: "disagree", reviewedVerdict: "high_risk", reviewerNote: "Logo differs" });
    expect(listener).toHaveBeenCalledWith({
      reviewId: "r-1",
      scanId: "s-1",
      reviewerId: "me",
      decision: "disagree",
      aiVerdict: "suspicious",
      reviewedVerdict: "high_risk",
    });
  });

  it("the SLA job escalates overdue reviews, releases lapsed claims and deletes old photos", async () => {
    repo.escalateOverdue.mockResolvedValue([{ id: "r-1", priority: 1, escalationLevel: 1, scanId: "s-1" }]);
    repo.releaseStaleClaims.mockResolvedValue({ count: 2 });
    repo.purgeImages.mockResolvedValue({ count: 3 });
    const listener = vi.fn();
    appEvents.once("review:escalated", listener);

    const now = new Date("2026-10-30T12:05:00Z");
    expect(await reviewService.maintain(now)).toEqual({ escalated: 1, released: 2, photosDeleted: 3 });
    expect(listener).toHaveBeenCalledWith({ reviewId: "r-1", scanId: "s-1", priority: 1, level: 1 });
    expect(repo.releaseStaleClaims).toHaveBeenCalledWith(new Date("2026-10-30T11:05:00Z"));
    expect(repo.purgeImages).toHaveBeenCalledWith(new Date("2026-10-23T12:05:00Z"));
  });
});
