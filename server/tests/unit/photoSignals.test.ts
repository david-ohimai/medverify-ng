import { describe, expect, it } from "vitest";
import type { LabelRead, PackCompare } from "../../src/ai/tasks.js";
import { combineSignals, photoSignals, type ComparisonOutcome } from "../../src/services/risk/photoSignals.js";
import { assessRisk, type Signal } from "../../src/services/risk/riskScorer.js";

const field = (value: string | null, confidence = 0.95) => ({ value, confidence });
const label = (overrides: Partial<LabelRead> = {}): LabelRead => ({
  is_medicine_pack: true,
  image_quality: "good",
  brand_name: field("Demoquine"),
  generic_name: field("Artemether/Lumefantrine"),
  strength: field(null, 0),
  nafdac_no: field("X9-0001"),
  batch_no: field("DQ2401"),
  mfg_date: field(null, 0),
  expiry_date: field("2027-08"),
  manufacturer: field(null, 0),
  text_anomalies: [],
  ...overrides,
});

const compared = (overrides: Partial<PackCompare> = {}): ComparisonOutcome => ({
  status: "compared",
  productName: "Demoquine",
  result: {
    comparable: true,
    same_product: true,
    logo_match: 0.95,
    colour_match: 0.95,
    typography_match: 0.95,
    layout_match: 0.95,
    print_quality: 0.9,
    differences: [],
    overall_visual_similarity: 0.95,
    ...overrides,
  },
});

const codes = (signals: Signal[]) => signals.map((signal) => signal.code);
const run = (comparison: ComparisonOutcome | null, labelOverrides: Partial<LabelRead> = {}, registryClean = true) =>
  photoSignals({ label: label(labelOverrides), comparison, registryClean });

describe("photoSignals", () => {
  it("a close match with clean records counts in the pack's favour (−20)", () => {
    const signals = run(compared());
    expect(signals).toEqual([expect.objectContaining({ code: "VISUAL_MATCH", weight: -20, severity: "good" })]);
  });

  it("a close match doesn't reassure when the records or the label show a problem", () => {
    expect(codes(run(compared(), {}, false))).toEqual([]);
    expect(codes(run(compared(), { text_anomalies: ["'Tabelts'"] }))).toEqual(["TEXT_ANOMALIES"]);
  });

  it("visual differences: (0.8 − similarity) × 75, between 1 and 30, with the major differences as detail", () => {
    const signals = run(
      compared({
        overall_visual_similarity: 0.5,
        differences: [
          { area: "logo", description: "square instead of round", severity: "major" },
          { area: "header", description: "slightly lighter green", severity: "minor" },
        ],
      })
    );
    expect(signals[0]).toMatchObject({ code: "VISUAL_MISMATCH", weight: 23, severity: "danger", detail: "logo: square instead of round" });
    expect(run(compared({ overall_visual_similarity: 0.79 }))[0]).toMatchObject({ weight: 1, severity: "warning" });
    expect(run(compared({ overall_visual_similarity: 0 }))[0]).toMatchObject({ weight: 30 });
  });

  it("between the bands (0.80–0.84) it neither helps nor hurts", () => {
    expect(run(compared({ overall_visual_similarity: 0.82 }))).toEqual([]);
  });

  it("a different product altogether is the maximum visual penalty", () => {
    expect(run(compared({ same_product: false, overall_visual_similarity: 0.9 }))[0]).toMatchObject({
      code: "VISUAL_MISMATCH",
      weight: 30,
      label: "Doesn't look like the genuine Demoquine pack",
    });
  });

  it("text anomalies: +10 each, at most +20", () => {
    expect(run(null, { text_anomalies: ["a"] })[0]).toMatchObject({ code: "TEXT_ANOMALIES", weight: 10 });
    expect(run(null, { text_anomalies: ["a", "b", "c"] })[0]).toMatchObject({ weight: 20, detail: "a; b; c" });
  });

  it("no comparison (no reference, wrong side, AI down) → PACK_NOT_COMPARED, weight 0", () => {
    for (const status of ["no_reference", "not_comparable", "unavailable"] as const) {
      expect(run({ status })).toEqual([expect.objectContaining({ code: "PACK_NOT_COMPARED", weight: 0 })]);
    }
    expect(codes(run(compared({ comparable: false })))).toEqual(["PACK_NOT_COMPARED"]);
  });

  it("an unregistered product has nothing to compare: no comparison signal at all", () => {
    expect(run(null)).toEqual([]);
  });

  it("a poor photo is flagged so the user retakes it", () => {
    expect(codes(run(compared(), { image_quality: "poor" }))).toContain("POOR_IMAGE");
  });
});

describe("combineSignals", () => {
  const known: Signal = { code: "BATCH_KNOWN", label: "", weight: -10, severity: "good" };
  const name: Signal = { code: "NAME_MATCHES_REGISTRY", label: "", weight: 0, severity: "good" };

  it("a known batch stops reassuring once the pack itself looks wrong (fakes copy batch numbers)", () => {
    const anomalies: Signal = { code: "TEXT_ANOMALIES", label: "", weight: 20, severity: "warning" };
    expect(codes(combineSignals([name, known], [anomalies]))).toEqual(["NAME_MATCHES_REGISTRY", "TEXT_ANOMALIES"]);
  });

  it("keeps it when the photo raised nothing", () => {
    const match: Signal = { code: "VISUAL_MATCH", label: "", weight: -20, severity: "good" };
    expect(codes(combineSignals([name, known], [match]))).toEqual(["NAME_MATCHES_REGISTRY", "BATCH_KNOWN", "VISUAL_MATCH"]);
  });
});

describe("assessRisk with photo signals", () => {
  const known: Signal = { code: "BATCH_KNOWN", label: "", weight: -10, severity: "good" };
  const match: Signal = { code: "VISUAL_MATCH", label: "", weight: -20, severity: "good" };

  it("a known batch that also matches the genuine pack can be high confidence", () => {
    expect(assessRisk([known, match])).toEqual({ verdict: "likely_genuine", riskScore: 0, confidence: "high" });
  });

  it("without a comparison, a clean photo scan is only medium confidence", () => {
    expect(assessRisk([known, { code: "PACK_NOT_COMPARED", label: "", weight: 0, severity: "info" }]).confidence).toBe("medium");
  });

  it("a poor photo always means low confidence", () => {
    expect(assessRisk([known, match, { code: "POOR_IMAGE", label: "", weight: 0, severity: "warning" }]).confidence).toBe("low");
  });

  it("a warning built only on what the pack looks like is medium, not high, confidence", () => {
    const result = assessRisk([
      known,
      { code: "VISUAL_MISMATCH", label: "", weight: 30, severity: "danger" },
      { code: "TEXT_ANOMALIES", label: "", weight: 20, severity: "warning" },
    ]);
    expect(result).toEqual({ verdict: "suspicious", riskScore: 40, confidence: "medium" });
  });
});
