import type { Confidence, ScanKind, Verdict } from "../../generated/prisma/enums.js";
import type { Signal, SignalCode } from "../risk/riskScorer.js";

/**
 * When a human must look, and how fast. Pure functions, fully tested.
 *
 *   P1, the scan says don't take it (high risk / unregistered): decide within 4 h
 *   P2, suspicious: within 24 h
 *   P3, "likely genuine", but the photo itself raised a doubt (blurry, odd
 *        spelling, looks a bit different): within 48 h. This is where a fake
 *        could slip through as "genuine", so a person double-checks.
 *
 * Only photo scans are reviewed, a reviewer needs the pack to look at.
 */
export const SLA_HOURS: Record<1 | 2 | 3, number> = { 1: 4, 2: 24, 3: 48 };
/** A claim lapses if not decided within an hour, so a review is never stuck with one person. */
export const CLAIM_TTL_MS = 60 * 60 * 1000;
/** The photo is kept for review at most this long. */
export const IMAGE_RETENTION_DAYS = 7;

const PHOTO_DOUBTS: SignalCode[] = ["POOR_IMAGE", "VISUAL_MISMATCH", "TEXT_ANOMALIES"];

export interface ReviewNeed {
  priority: 1 | 2 | 3;
  reasons: string[];
  slaHours: number;
}

export function reviewNeeded(scan: { kind: ScanKind; verdict: Verdict; confidence: Confidence; signals: readonly Signal[] }): ReviewNeed | null {
  if (scan.kind !== "photo") return null;
  const doubts = scan.signals.map((signal) => signal.code).filter((code) => PHOTO_DOUBTS.includes(code));

  let priority: ReviewNeed["priority"];
  let reasons: string[];
  if (scan.verdict === "high_risk" || scan.verdict === "unregistered") {
    priority = 1;
    reasons = [scan.verdict.toUpperCase()];
  } else if (scan.verdict === "suspicious") {
    priority = 2;
    reasons = ["SUSPICIOUS"];
  } else if (doubts.length > 0) {
    priority = 3;
    reasons = ["GENUINE_BUT_DOUBTFUL"];
  } else {
    return null;
  }
  if (scan.confidence === "low") reasons.push("LOW_CONFIDENCE");
  return { priority, reasons: [...reasons, ...new Set(doubts)], slaHours: SLA_HOURS[priority] };
}

export function slaDeadline(createdAt: Date, priority: 1 | 2 | 3): Date {
  return new Date(createdAt.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000);
}

/**
 * A missed deadline escalates the review: one level up, and a new, shorter
 * deadline (half the original SLA) so it keeps surfacing at the top.
 */
export function escalatedDeadline(now: Date, priority: number): Date {
  const hours = SLA_HOURS[(Math.min(Math.max(priority, 1), 3) as 1 | 2 | 3)] / 2;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** The verdict the user should act on: the reviewer's if they set one, otherwise the scan's. */
export function finalVerdict(scanVerdict: Verdict | null, review: { decision: string | null; reviewedVerdict: Verdict | null } | null): Verdict | null {
  return review?.decision === "disagree" && review.reviewedVerdict ? review.reviewedVerdict : scanVerdict;
}
