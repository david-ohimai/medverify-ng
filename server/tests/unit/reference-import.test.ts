import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadReferenceImages } from "../../prisma/seed/reference-import.js";

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "medverify-ref-"));
  const photo = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: "#2a7" } }).jpeg().toBuffer();
  const add = (path: string, data: Buffer | string) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), data);
  };
  add("A4-1234/front-1.jpg", photo);
  add("A4-1234/back.jpg", photo);
  add("A4-1234/README.md", "notes");
  add("A4-1234/photo.jpg", photo); // bad name
  add("X9-0001/front-1.jpg", photo); // product not loaded (e.g. --no-demo)
  add("not-a-number/front-1.jpg", photo);
  add("B1-2222/front-1.jpg", "not an image");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("loadReferenceImages", () => {
  it("loads, resizes and hashes valid photos, and reports every problem with its path", async () => {
    const result = await loadReferenceImages(
      dir,
      new Map([
        ["A4-1234", "greenbook"],
        ["B1-2222", "greenbook"],
      ])
    );

    expect(result.rows.map((row) => [row.nafdacNo, row.side, row.width, row.source])).toEqual([
      ["A4-1234", "back", 1024, "pack_label"],
      ["A4-1234", "front", 1024, "pack_label"],
    ]);
    expect(result.rows[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.skipped).toEqual(["X9-0001"]);
    expect(result.errors).toEqual([
      expect.stringMatching(/^A4-1234\/photo\.jpg: name it front-1\.jpg/),
      expect.stringMatching(/^B1-2222\/front-1\.jpg: The file isn't an image/),
      expect.stringMatching(/^not-a-number\/: folder name must be a NAFDAC number/),
    ]);
  });

  it("photos of a demo product are demo data", async () => {
    const result = await loadReferenceImages(dir, new Map([["X9-0001", "demo"]]));
    expect(result.rows).toEqual([expect.objectContaining({ nafdacNo: "X9-0001", source: "demo" })]);
  });
});
