import { describe, expect, it } from "vitest";
import { registrySignals, type RegistryCheckInput } from "../../src/services/risk/registrySignals.js";
import { assessRisk } from "../../src/services/risk/riskScorer.js";

const TODAY = new Date("2026-10-28T00:00:00Z");
const product = { nafdacNo: "X9-0001", brandName: "Demoquine", status: "active" as const };
const goodBatch = { batchNo: "DQ2401", expiryDate: new Date("2027-08-31T00:00:00Z"), recalled: false, recallNote: null };

function check(overrides: Partial<RegistryCheckInput>) {
  const signals = registrySignals({
    nafdacNo: "X9-0001",
    product,
    nameSimilarity: null,
    batchNo: "DQ2401",
    batch: goodBatch,
    printedExpiry: null,
    packNotSeen: true,
    today: TODAY,
    ...overrides,
  });
  return { codes: signals.map((s) => s.code), ...assessRisk(signals) };
}

describe("registrySignals + assessRisk — the manual-check rules", () => {
  it("known, in-date batch of a registered product → likely genuine, medium confidence", () => {
    const result = check({ nameSimilarity: 0.9 });
    expect(result.codes).toEqual(["PACK_NOT_SEEN", "NAME_MATCHES_REGISTRY", "BATCH_KNOWN"]);
    expect(result).toMatchObject({ verdict: "likely_genuine", confidence: "medium" });
  });

  it("number not in the register → unregistered; nothing else is checked", () => {
    const result = check({ product: null });
    expect(result.codes).toEqual(["PACK_NOT_SEEN", "NOT_IN_REGISTRY"]);
    expect(result).toMatchObject({ verdict: "unregistered", confidence: "high" });
  });

  it("real number on a different product (cloned number) → suspicious", () => {
    const result = check({ nameSimilarity: 0.1 });
    expect(result.codes).toContain("NAME_MISMATCH");
    expect(result.verdict).toBe("suspicious");
  });

  it("cancelled registration → suspicious, even when the batch is known (no reassurance)", () => {
    const result = check({ product: { ...product, status: "cancelled" } });
    expect(result.codes).toContain("REGISTRATION_INACTIVE");
    expect(result.codes).not.toContain("BATCH_KNOWN");
    expect(result.verdict).toBe("suspicious");
  });

  it("cloned number with a known batch → still suspicious (no reassurance)", () => {
    const result = check({ nameSimilarity: 0.1 });
    expect(result.codes).not.toContain("BATCH_KNOWN");
    expect(result.verdict).toBe("suspicious");
  });

  it("recalled batch → high risk", () => {
    const result = check({ batch: { ...goodBatch, recalled: true, recallNote: "failed test" } });
    expect(result.codes).toContain("BATCH_RECALLED");
    expect(result).toMatchObject({ verdict: "high_risk", confidence: "high" });
  });

  it("expired batch → high risk, and no 'known batch' reassurance", () => {
    const result = check({ batch: { ...goodBatch, expiryDate: new Date("2025-02-28T00:00:00Z") } });
    expect(result.codes).toContain("EXPIRED");
    expect(result.codes).not.toContain("BATCH_KNOWN");
    expect(result.verdict).toBe("high_risk");
  });

  it("expired by the printed date when the batch is unknown → high risk", () => {
    const result = check({ batch: null, batchNo: "ZZ1", printedExpiry: new Date("2026-01-31T00:00:00Z") });
    expect(result.codes).toEqual(expect.arrayContaining(["BATCH_UNKNOWN", "EXPIRED"]));
    expect(result.verdict).toBe("high_risk");
  });

  it("printed expiry contradicting the batch record → suspicious, no reassurance", () => {
    const result = check({ printedExpiry: new Date("2028-01-31T00:00:00Z") });
    expect(result.codes).toContain("EXPIRY_MISMATCH");
    expect(result.codes).not.toContain("BATCH_KNOWN");
    expect(result.verdict).toBe("suspicious");
  });

  it("printed expiry in the same month as the record is a match (packs print months)", () => {
    const result = check({ printedExpiry: new Date("2027-08-01T00:00:00Z") });
    expect(result.codes).not.toContain("EXPIRY_MISMATCH");
  });

  it("unknown batch → likely genuine but LOW confidence (our batch records are incomplete)", () => {
    const result = check({ batch: null, batchNo: "ZZ999" });
    expect(result.codes).toContain("BATCH_UNKNOWN");
    expect(result).toMatchObject({ verdict: "likely_genuine", confidence: "low" });
  });

  it("no batch given → recalls couldn't be checked, low confidence", () => {
    const result = check({ batch: null, batchNo: null });
    expect(result.codes).toContain("BATCH_NOT_GIVEN");
    expect(result.confidence).toBe("low");
  });
});
