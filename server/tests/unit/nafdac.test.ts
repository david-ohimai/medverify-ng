import { describe, expect, it } from "vitest";
import { parseExpiry, todayUtc } from "../../src/lib/dates.js";
import { isValidNafdacNo, normalizeBatchNo, normalizeNafdacNo } from "../../src/lib/nafdac.js";

describe("normalizeNafdacNo", () => {
  it.each([
    ["A4-1234", "A4-1234"],
    ["a4-1234", "A4-1234"],
    [" a4 - 1234 ", "A4-1234"],
    ["A4–1234", "A4-1234"], // en dash
    ["A4—1234", "A4-1234"], // em dash
    ["A4−1234", "A4-1234"], // minus sign
    ["NAFDAC Reg. No: A4-1234", "A4-1234"],
    ["NAFDAC REG NO A4-1234", "A4-1234"],
    ["nafdac no. 04-5678", "04-5678"],
    ["A4--1234", "A4-1234"],
    ["NAFDAC No – A4-1234", "A4-1234"], // en dash as the separator after the prefix
    ["NAFDAC No — A4–1234", "A4-1234"], // em dash: test input as OCR reads it, keep
  ])("%j → %s", (raw, expected) => {
    const normalized = normalizeNafdacNo(raw);
    expect(normalized).toBe(expected);
    expect(isValidNafdacNo(normalized)).toBe(true);
  });

  it.each(["hello", "1234", "A4-12", "A4_1234", "ABC-1234", "A4-1234567", ""])("rejects %j", (raw) => {
    expect(isValidNafdacNo(normalizeNafdacNo(raw))).toBe(false);
  });
});

describe("normalizeBatchNo", () => {
  it("upper-cases and removes spaces", () => {
    expect(normalizeBatchNo(" lt 2391 ")).toBe("LT2391");
    expect(normalizeBatchNo("b– 07")).toBe("B-07");
  });
});

describe("parseExpiry", () => {
  it("a month means the last day of that month", () => {
    expect(parseExpiry("2027-08")?.toISOString().slice(0, 10)).toBe("2027-08-31");
    expect(parseExpiry("2028-02")?.toISOString().slice(0, 10)).toBe("2028-02-29"); // leap year
    expect(parseExpiry("2027-02")?.toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  it("accepts a full date", () => {
    expect(parseExpiry("2027-08-15")?.toISOString().slice(0, 10)).toBe("2027-08-15");
  });

  it.each(["2027-13", "2027-00", "2027-02-30", "08/2027", "2027", "soon", "0027-08", "0099-01-01", "2200-01"])("rejects %j", (value) => {
    expect(parseExpiry(value)).toBeNull();
  });
});

describe("todayUtc", () => {
  it("drops the time of day", () => {
    expect(todayUtc(new Date("2026-10-28T23:59:00Z")).toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });
});
