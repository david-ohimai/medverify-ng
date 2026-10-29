import type { LabelRead, PackCompare } from "../../ai/tasks.js";
import type { Signal } from "./riskScorer.js";

/** Below this the pack looks different enough from the genuine one to count against it. */
export const VISUAL_MISMATCH_BELOW = 0.8;
/** At or above this, a close visual match counts in the pack's favour. */
export const VISUAL_MATCH_FROM = 0.85;

export type ComparisonOutcome =
  | { status: "compared"; result: PackCompare; productName: string }
  /** Why no comparison was possible; turned into PACK_NOT_COMPARED. */
  | { status: "no_reference" | "not_comparable" | "unavailable" };

export interface PhotoCheckInput {
  label: LabelRead;
  /** Null when the product isn't in the register: there's nothing to compare with. */
  comparison: ComparisonOutcome | null;
  /** True when the registry raised no concern at all (every registry signal weight ≤ 0). */
  registryClean: boolean;
}

const NOT_COMPARED_LABEL: Record<Exclude<ComparisonOutcome["status"], "compared">, string> = {
  no_reference: "No photo of the genuine pack to compare with yet",
  not_comparable: "The photo shows a side or angle we couldn't compare",
  unavailable: "The pack comparison couldn't run this time",
};

/**
 * Registry and photo signals together. A known batch number only
 * reassures when nothing about the pack itself looks wrong — fakes copy
 * real batch numbers too — so BATCH_KNOWN is dropped when the photo raised
 * a concern.
 */
export function combineSignals(registry: readonly Signal[], photo: readonly Signal[]): Signal[] {
  const photoConcern = photo.some((signal) => signal.weight > 0);
  return [...registry.filter((signal) => !(photoConcern && signal.code === "BATCH_KNOWN")), ...photo];
}

/**
 * What the AI saw on the photo, as weighted, explained signals — the
 * photo-only half of the rules (the registry half is registrySignals).
 * Weights from the plan (mvp.md §6.4). Pure function, fully tested.
 */
export function photoSignals(input: PhotoCheckInput): Signal[] {
  const signals: Signal[] = [];
  const { label, comparison } = input;

  if (label.image_quality === "poor") {
    signals.push({
      code: "POOR_IMAGE",
      label: "The photo is blurry, dark or partly cut off",
      weight: 0,
      severity: "warning",
      detail: "Retake it in good light, flat and in focus, for a surer result.",
    });
  }

  if (label.text_anomalies.length > 0) {
    signals.push({
      code: "TEXT_ANOMALIES",
      label: `${label.text_anomalies.length === 1 ? "A printing or spelling problem" : "Printing or spelling problems"} on the label`,
      weight: Math.min(20, 10 * label.text_anomalies.length),
      severity: "warning",
      detail: label.text_anomalies.slice(0, 3).join("; "),
    });
  }

  if (!comparison) return signals;

  if (comparison.status !== "compared") {
    signals.push({ code: "PACK_NOT_COMPARED", label: NOT_COMPARED_LABEL[comparison.status], weight: 0, severity: "info" });
    return signals;
  }

  const { result, productName } = comparison;
  if (!result.comparable) {
    signals.push({ code: "PACK_NOT_COMPARED", label: NOT_COMPARED_LABEL.not_comparable, weight: 0, severity: "info" });
    return signals;
  }

  const similarity = result.overall_visual_similarity;
  const major = result.differences.filter((difference) => difference.severity === "major");
  const percent = `${Math.round(similarity * 100)}% similar`;

  if (!result.same_product) {
    signals.push({
      code: "VISUAL_MISMATCH",
      label: `Doesn't look like the genuine ${productName} pack`,
      weight: 30,
      severity: "danger",
      detail: "The number on it belongs to a product whose genuine pack looks different.",
    });
  } else if (similarity < VISUAL_MISMATCH_BELOW) {
    const weight = Math.max(1, Math.min(30, Math.round((VISUAL_MISMATCH_BELOW - similarity) * 75)));
    signals.push({
      code: "VISUAL_MISMATCH",
      label: `Differs from the genuine ${productName} pack (${percent})`,
      weight,
      severity: weight >= 15 ? "danger" : "warning",
      ...(major.length > 0 || result.differences.length > 0
        ? { detail: (major.length > 0 ? major : result.differences).slice(0, 3).map((d) => `${d.area}: ${d.description}`).join("; ") }
        : {}),
    });
  } else if (similarity >= VISUAL_MATCH_FROM && input.registryClean && label.text_anomalies.length === 0) {
    // A close match only reassures when nothing else is wrong (like BATCH_KNOWN).
    signals.push({
      code: "VISUAL_MATCH",
      label: `Looks like the genuine ${productName} pack (${percent})`,
      weight: -20,
      severity: "good",
    });
  }

  return signals;
}
