import { describe, expect, it } from "vitest";
import { adviceFor, assessRisk, type Signal, type SignalCode } from "../../src/services/risk/riskScorer.js";

function signal(code: SignalCode, weight = 0): Signal {
  return { code, label: code, weight, severity: weight > 0 ? "danger" : "info" };
}

describe("assessRisk — score and verdict", () => {
  it("sums weights and clamps to 0–100", () => {
    expect(assessRisk([signal("BATCH_KNOWN", -10)]).riskScore).toBe(0);
    expect(assessRisk([signal("NAME_MISMATCH", 40), signal("REGISTRATION_INACTIVE", 35), signal("EXPIRY_MISMATCH", 30)]).riskScore).toBe(100);
  });

  it("uses the bands: <30 likely genuine, 30–64 suspicious, ≥65 high risk", () => {
    expect(assessRisk([signal("EXPIRY_MISMATCH", 29)]).verdict).toBe("likely_genuine");
    expect(assessRisk([signal("EXPIRY_MISMATCH", 30)]).verdict).toBe("suspicious");
    expect(assessRisk([signal("NAME_MISMATCH", 64)]).verdict).toBe("suspicious");
    expect(assessRisk([signal("NAME_MISMATCH", 40), signal("EXPIRY_MISMATCH", 30)]).verdict).toBe("high_risk");
  });

  it("an unregistered number is 'unregistered' whatever the score", () => {
    expect(assessRisk([signal("NOT_IN_REGISTRY", 45)]).verdict).toBe("unregistered");
  });

  it("a recalled or expired batch is always 'high_risk', even below the band", () => {
    expect(assessRisk([signal("BATCH_RECALLED", 50)]).verdict).toBe("high_risk");
    expect(assessRisk([signal("EXPIRED", 35)]).verdict).toBe("high_risk");
  });
});

describe("assessRisk — confidence", () => {
  it("high when a hard fact drives a negative verdict", () => {
    expect(assessRisk([signal("PACK_NOT_SEEN"), signal("NOT_IN_REGISTRY", 45)]).confidence).toBe("high");
    expect(assessRisk([signal("PACK_NOT_SEEN"), signal("BATCH_RECALLED", 50)]).confidence).toBe("high");
  });

  it("low when the batch couldn't be checked", () => {
    expect(assessRisk([signal("PACK_NOT_SEEN"), signal("BATCH_UNKNOWN")]).confidence).toBe("low");
    expect(assessRisk([signal("BATCH_NOT_GIVEN")]).confidence).toBe("low");
  });

  it("only medium for a clean typed-in check: fakes copy real numbers", () => {
    expect(assessRisk([signal("PACK_NOT_SEEN"), signal("BATCH_KNOWN", -10)]).confidence).toBe("medium");
  });
});

describe("adviceFor", () => {
  it("expired gets its own plain headline", () => {
    expect(adviceFor("high_risk", [signal("EXPIRED", 35)]).headline).toBe("Expired — do not take it");
  });

  it("never claims a medicine is safe", () => {
    for (const verdict of ["likely_genuine", "suspicious", "high_risk", "unregistered"] as const) {
      expect(JSON.stringify(adviceFor(verdict)).toLowerCase()).not.toMatch(/100%|guaranteed|definitely safe/);
    }
  });
});
