import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { LabelRead } from "../../src/ai/tasks.js";
import { UnsupportedMediaError, ValidationError } from "../../src/lib/errors.js";
import { prepareImage } from "../../src/lib/image.js";
import { factsFromLabel } from "../../src/services/photoScan.service.js";

const field = (value: string | null, confidence = 0.95) => ({ value, confidence });
const label = (overrides: Partial<LabelRead> = {}): LabelRead => ({
  is_medicine_pack: true,
  image_quality: "good",
  brand_name: field("Demoquine"),
  generic_name: field("Artemether/Lumefantrine"),
  strength: field(null, 0),
  nafdac_no: field("NAFDAC Reg. No: x9 – 0001"),
  batch_no: field("dq 2401"),
  mfg_date: field(null, 0),
  expiry_date: field("2027-08"),
  manufacturer: field(null, 0),
  text_anomalies: [],
  ...overrides,
});

describe("factsFromLabel — what the AI read becomes registry facts", () => {
  it("normalises every field the same way a typed-in check does", () => {
    expect(factsFromLabel(label())).toEqual({
      nafdacNo: "X9-0001",
      productName: "Demoquine",
      batchNo: "DQ2401",
      expiry: new Date("2027-08-31T00:00:00.000Z"),
    });
  });

  it("ignores fields the model wasn't sure of — no guessing", () => {
    const facts = factsFromLabel(label({ nafdac_no: field("X9-0001", 0.4), batch_no: field("DQ2401", 0.59) }));
    expect(facts.nafdacNo).toBeNull();
    expect(facts.batchNo).toBeNull();
  });

  it("drops a read that can't be a NAFDAC number or a date", () => {
    const facts = factsFromLabel(label({ nafdac_no: field("hello"), expiry_date: field("08/2027") }));
    expect(facts.nafdacNo).toBeNull();
    expect(facts.expiry).toBeNull();
  });

  it("falls back to the generic name when no brand name was read", () => {
    expect(factsFromLabel(label({ brand_name: field(null, 0) })).productName).toBe("Artemether/Lumefantrine");
  });
});

describe("prepareImage", () => {
  it("rejects a file that isn't an image, whatever its name says", async () => {
    await expect(prepareImage(Buffer.from("#!/bin/sh\necho hi\n"))).rejects.toBeInstanceOf(UnsupportedMediaError);
  });

  it("rejects a photo too small to read", async () => {
    const tiny = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    await expect(prepareImage(tiny)).rejects.toBeInstanceOf(ValidationError);
  });

  it("re-encodes as JPEG, shrinks to 1600 px and strips metadata (EXIF / GPS)", async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#abc" } })
      .png()
      .withExif({ IFD0: { Copyright: "secret location" } })
      .toBuffer();

    const prepared = await prepareImage(big);
    const out = await sharp(prepared.data).metadata();

    expect(prepared).toMatchObject({ mimeType: "image/jpeg", width: 1600, height: 1067, originalFormat: "png" });
    expect(prepared.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.format).toBe("jpeg");
    expect(out.exif).toBeUndefined();
  });
});
