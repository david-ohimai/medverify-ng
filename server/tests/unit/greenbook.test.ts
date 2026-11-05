import { describe, expect, it } from "vitest";
import { dedupe, toCsv, toProduct } from "../../prisma/seed/greenbook.js";
import { parseCsv, productRow } from "../../prisma/seed/registry-import.js";

const record = {
  product_name: "Brustan-N Tablets 400 mg##",
  NAFDAC: " 04-0694",
  strength: "400 mg",
  status: "Active",
  approval_date: "2023-09-28",
  deleted_at: null,
  ingredient: { ingredient_name: "Ibuprofen" },
  form: { name: "Tablet" },
  applicant: { name: "Ranbaxy Nigeria Ltd &amp; Co" },
};

describe("toProduct", () => {
  it("cleans a Greenbook record into a registry row", () => {
    expect(toProduct(record)).toMatchObject({
      nafdac_no: "04-0694",
      brand_name: "Brustan-N Tablets 400 mg",
      generic_name: "Ibuprofen",
      manufacturer: "Ranbaxy Nigeria Ltd & Co",
      status: "active",
      source: "greenbook",
    });
  });

  it("marks anything not active as no longer registered", () => {
    expect(toProduct({ ...record, status: "Inactive" })?.status).toBe("expired");
  });

  it.each(["NA", "", "4/1/2252", "18225", "00-0000", null])("skips the unusable number %j", (NAFDAC) => {
    expect(toProduct({ ...record, NAFDAC })).toBeNull();
  });

  it("skips deleted records", () => {
    expect(toProduct({ ...record, deleted_at: "2025-01-01" })).toBeNull();
  });

  it("falls back to the brand when no ingredient is listed", () => {
    expect(toProduct({ ...record, ingredient: null })?.generic_name).toBe("Brustan-N Tablets 400 mg");
  });
});

describe("dedupe", () => {
  it("prefers an active row, then the newest approval", () => {
    const old = toProduct({ ...record, approval_date: "2019-01-01" })!;
    const newer = toProduct({ ...record, approval_date: "2023-09-28" })!;
    const inactive = toProduct({ ...record, status: "Inactive", approval_date: "2025-01-01" })!;
    expect(dedupe([old, inactive, newer])).toEqual([newer]);
  });
});

describe("toCsv", () => {
  it("writes rows the seed's own validator accepts, quoting commas and quotes", () => {
    const product = toProduct({ ...record, product_name: 'Brustan, "N"', strength: "1%; 5%" })!;
    const { rows, errors } = parseCsv("products.csv", toCsv([product], "2026-11-04"), productRow);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ nafdac_no: "04-0694", brand_name: 'Brustan, "N"', status: "active" });
  });
});
