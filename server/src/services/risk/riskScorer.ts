import type { Confidence, Verdict } from "../../generated/prisma/enums.js";

/**
 * Every reason behind a verdict. The app shows these as "Why we think so",
 * so a verdict is never a bare yes/no.
 */
export type SignalCode =
  // Registry facts
  | "NOT_IN_REGISTRY"
  | "REGISTRATION_INACTIVE"
  | "NAME_MATCHES_REGISTRY"
  | "NAME_MISMATCH"
  | "BATCH_KNOWN"
  | "BATCH_UNKNOWN"
  | "BATCH_NOT_GIVEN"
  | "BATCH_RECALLED"
  | "EXPIRED"
  | "EXPIRY_MISMATCH"
  // Limits of a typed-in check
  | "PACK_NOT_SEEN"
  // The matched record is fictional test data
  | "DEMO_RECORD"
  // What the AI saw on the pack photo
  | "TEXT_ANOMALIES"
  | "VISUAL_MISMATCH"
  | "VISUAL_MATCH"
  | "PACK_NOT_COMPARED"
  | "POOR_IMAGE";

export type SignalSeverity = "good" | "info" | "warning" | "danger";

export interface Signal {
  code: SignalCode;
  /** Short, user-facing explanation. */
  label: string;
  /** Points added to (positive) or removed from (negative) the risk score. */
  weight: number;
  severity: SignalSeverity;
  detail?: string;
}

/**
 * Signals that are hard facts, not inferences. When one of them drives the
 * verdict we can be confident; without them a typed-in check can only say
 * "nothing wrong in the records".
 */
const HARD_EVIDENCE: ReadonlySet<SignalCode> = new Set([
  "NOT_IN_REGISTRY",
  "REGISTRATION_INACTIVE",
  "NAME_MISMATCH",
  "BATCH_RECALLED",
  "EXPIRED",
]);

/** Signals that leave us unsure what we're looking at. */
const UNCERTAINTY: ReadonlySet<SignalCode> = new Set(["BATCH_UNKNOWN", "BATCH_NOT_GIVEN", "POOR_IMAGE"]);

/**
 * Clean records, but the pack itself wasn't (fully) examined: typed in, or
 * no genuine reference to compare it with. Counterfeiters copy real numbers,
 * so we can't be more than moderately sure.
 */
const PACK_UNVERIFIED: ReadonlySet<SignalCode> = new Set(["PACK_NOT_SEEN", "PACK_NOT_COMPARED"]);

export const RISK_BANDS = { suspicious: 30, highRisk: 65 } as const;

export interface RiskAssessment {
  verdict: Verdict;
  riskScore: number;
  confidence: Confidence;
}

/**
 * Turns signals into one score and verdict. Transparent on purpose: the
 * weights live on the signals, the sum is clamped to 0–100, and three facts
 * override the bands — an unregistered number is "unregistered", and a
 * recalled or expired batch is always "high_risk" (whatever the pack's
 * authenticity, it must not be taken). Pure function: no I/O, fully tested.
 */
export function assessRisk(signals: readonly Signal[]): RiskAssessment {
  const raw = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const riskScore = Math.max(0, Math.min(100, Math.round(raw)));
  const has = (code: SignalCode) => signals.some((signal) => signal.code === code);

  let verdict: Verdict;
  if (has("NOT_IN_REGISTRY")) verdict = "unregistered";
  else if (has("BATCH_RECALLED") || has("EXPIRED") || riskScore >= RISK_BANDS.highRisk) verdict = "high_risk";
  else if (riskScore >= RISK_BANDS.suspicious) verdict = "suspicious";
  else verdict = "likely_genuine";

  let confidence: Confidence;
  if (has("DEMO_RECORD")) {
    // Fictional test data proves nothing about a real medicine.
    confidence = "low";
  } else if (verdict !== "likely_genuine" && signals.some((signal) => HARD_EVIDENCE.has(signal.code))) {
    confidence = "high";
  } else if (signals.some((signal) => UNCERTAINTY.has(signal.code))) {
    confidence = "low";
  } else if (verdict !== "likely_genuine") {
    // A warning built only on inferences (visual differences, odd spelling).
    confidence = "medium";
  } else if (signals.some((signal) => PACK_UNVERIFIED.has(signal.code))) {
    confidence = "medium";
  } else {
    confidence = "high";
  }

  return { verdict, riskScore, confidence };
}

const ADVICE: Record<Verdict, { headline: string; advice: string }> = {
  likely_genuine: {
    headline: "Likely genuine",
    advice: "Nothing in the records suggests a problem. Still check the pack is sealed and undamaged.",
  },
  suspicious: {
    headline: "Suspicious",
    advice: "Something doesn't match the records. Ask a pharmacist before taking it.",
  },
  high_risk: {
    headline: "High risk — do not take it",
    advice: "Don't take this medicine. Show it to a pharmacist or report it to NAFDAC.",
  },
  unregistered: {
    headline: "Not found in the NAFDAC register",
    advice: "This number isn't in our copy of the register. Don't take it until a pharmacist has checked it.",
  },
};

/** The headline and advice for a verdict; expiry gets its own, clearer wording. */
export function adviceFor(verdict: Verdict, signals: readonly Signal[] = []): { headline: string; advice: string } {
  const has = (code: SignalCode) => signals.some((signal) => signal.code === code);
  if (has("EXPIRED") && !has("BATCH_RECALLED") && !has("NOT_IN_REGISTRY")) {
    return {
      headline: "Expired — do not take it",
      advice: "This medicine is past its expiry date. Don't take it; return it to the pharmacy.",
    };
  }
  return ADVICE[verdict];
}

/** Shown with every result: MedVerify never says a medicine is 100% safe. */
export const DISCLAIMER =
  "MedVerify gives a careful second opinion, not a guarantee. It never says a medicine is 100% safe.";
