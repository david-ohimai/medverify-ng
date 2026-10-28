import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { batchRow, checkConsistency, parseCsv, productRow } from "../../prisma/seed/registry-import.js";

const HEADER = "nafdac_no,brand_name,generic_name,strength,dosage_form,manufacturer,status,source";

describe("parseCsv — products", () => {
  it("normalises numbers and turns empty optional cells into null", () => {
    const { rows, errors } = parseCsv("p.csv", `${HEADER}\na4 – 1234,Coartem,Artemether/Lumefantrine,,Tablet,,active,greenbook\n`, productRow);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ nafdac_no: "A4-1234", strength: null, dosage_form: "Tablet", manufacturer: null });
  });

  it("reports every bad row with file and line, and ignores # comments", () => {
    const csv = [
      "# a comment line",
      HEADER,
      "A4-1234,Good,Generic,,,,active,greenbook",
      "nope,Bad Number,Generic,,,,active,greenbook",
      "A4-5678,,Generic,,,,active,greenbook",
      "A4-9999,Bad Source,Generic,,,,active,somewhere",
    ].join("\n");
    const { rows, errors } = parseCsv("products.csv", csv, productRow);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      expect.stringMatching(/^products\.csv:4 nafdac_no: not a valid NAFDAC number/),
      expect.stringMatching(/^products\.csv:5 brand_name: required/),
      expect.stringMatching(/^products\.csv:6 source:/),
    ]);
  });
});

describe("parseCsv — batches", () => {
  const header = "nafdac_no,batch_no,mfg_date,expiry_date,recalled,recall_note,source";

  it("parses month expiries to the end of the month and recalled flags", () => {
    const { rows, errors } = parseCsv("b.csv", `${header}\nA4-1234,lt 2391,2024-09-01,2027-08,true,"Failed test, see alert",nafdac_alert\n`, batchRow);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ batch_no: "LT2391", recalled: true, recall_note: "Failed test, see alert" });
    expect(rows[0]?.expiry_date?.toISOString().slice(0, 10)).toBe("2027-08-31");
  });

  it("rejects impossible dates", () => {
    const { errors } = parseCsv("b.csv", `${header}\nA4-1234,LT1,,2027-02-30,false,,greenbook\n`, batchRow);
    expect(errors[0]).toMatch(/^b\.csv:2 expiry_date: "2027-02-30" is not a date/);
  });
});

describe("checkConsistency", () => {
  it("catches duplicates and batches for products that don't exist", () => {
    const products = parseCsv("p", `${HEADER}\nA4-1234,A,G,,,,active,greenbook\nA4-1234,B,G,,,,active,greenbook\n`, productRow).rows;
    const batches = parseCsv(
      "b",
      "nafdac_no,batch_no,mfg_date,expiry_date,recalled,recall_note,source\nB7-0001,X1,,,false,,greenbook\n",
      batchRow
    ).rows;
    expect(checkConsistency(products, batches)).toEqual([
      "duplicate product A4-1234",
      "batch X1 refers to unknown product B7-0001",
    ]);
  });
});

describe("the committed demo data", () => {
  it("is valid, consistent and clearly fictional", () => {
    const dir = new URL("../../prisma/seed/data/", import.meta.url);
    const products = parseCsv("products.demo.csv", readFileSync(new URL("products.demo.csv", dir), "utf8"), productRow);
    const batches = parseCsv("batches.demo.csv", readFileSync(new URL("batches.demo.csv", dir), "utf8"), batchRow);

    expect([...products.errors, ...batches.errors]).toEqual([]);
    expect(checkConsistency(products.rows, batches.rows)).toEqual([]);
    for (const product of products.rows) {
      expect(product.source).toBe("demo");
      expect(product.manufacturer).toMatch(/fictional/i);
    }
  });
});
