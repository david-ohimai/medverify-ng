import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { deviceService } from "../../src/services/device.service.js";
import { registryService } from "../../src/services/registry.service.js";
import { scanService } from "../../src/services/scan.service.js";
import { verificationService } from "../../src/services/verification.service.js";

vi.mock("../../src/services/device.service.js", () => ({ deviceService: { getAuthState: vi.fn() } }));
vi.mock("../../src/services/verification.service.js", () => ({ verificationService: { verifyManual: vi.fn() } }));
vi.mock("../../src/services/scan.service.js", () => ({ scanService: { listForDevice: vi.fn(), getForDevice: vi.fn() } }));
vi.mock("../../src/services/registry.service.js", () => ({
  registryService: { search: vi.fn(), getProductWithBatches: vi.fn(), getReferenceImage: vi.fn() },
}));

const app = createApp();
const auth = `Bearer ${signAccessToken({ sub: "device-1", role: "public", ver: 1 })}`;

beforeEach(() => {
  vi.mocked(deviceService.getAuthState).mockResolvedValue({ role: "public", tokenVersion: 1 });
});

describe("POST /api/v1/verify/manual", () => {
  it("requires a device token", async () => {
    const res = await request(app).post("/api/v1/verify/manual").send({ nafdacNo: "A4-1234" });
    expect(res.status).toBe(401);
  });

  it("normalises the number, batch and expiry before the service sees them", async () => {
    vi.mocked(verificationService.verifyManual).mockResolvedValue({ headline: "Likely genuine" } as never);

    const res = await request(app)
      .post("/api/v1/verify/manual")
      .set("Authorization", auth)
      .send({ nafdacNo: "nafdac no: a4 – 1234", productName: "  Coartem ", batchNo: "lt 2391", expiry: "2027-08" });

    expect(res.status).toBe(201);
    expect(verificationService.verifyManual).toHaveBeenCalledWith("device-1", {
      nafdacNo: "A4-1234",
      productName: "Coartem",
      batchNo: "LT2391",
      expiry: new Date("2027-08-31T00:00:00.000Z"),
    });
  });

  it("rejects something that can't be a NAFDAC number, a bad expiry and unknown fields", async () => {
    const res = await request(app)
      .post("/api/v1/verify/manual")
      .set("Authorization", auth)
      .send({ nafdacNo: "hello", expiry: "08/2027", verdict: "likely_genuine" });

    expect(res.status).toBe(422);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["body.nafdacNo", "body.expiry"]));
    expect(verificationService.verifyManual).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/products/search", () => {
  it("needs at least 2 characters", async () => {
    const res = await request(app).get("/api/v1/products/search?q=a").set("Authorization", auth);
    expect(res.status).toBe(422);
  });

  it("passes the query and a capped limit", async () => {
    vi.mocked(registryService.search).mockResolvedValue([]);
    const res = await request(app).get("/api/v1/products/search?q=coartem&limit=5").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(registryService.search).toHaveBeenCalledWith("coartem", 5);

    const tooMany = await request(app).get("/api/v1/products/search?q=coartem&limit=500").set("Authorization", auth);
    expect(tooMany.status).toBe(422);
  });
});

describe("GET /api/v1/products/:nafdacNo", () => {
  it("validates the number like every other endpoint (422, no lookup)", async () => {
    const res = await request(app).get("/api/v1/products/hello%20world").set("Authorization", auth);
    expect(res.status).toBe(422);
    expect(registryService.getProductWithBatches).not.toHaveBeenCalled();
  });

  it("passes the normalised number", async () => {
    vi.mocked(registryService.getProductWithBatches).mockResolvedValue({} as never);
    const res = await request(app).get("/api/v1/products/a4%20-%201234").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(registryService.getProductWithBatches).toHaveBeenCalledWith("A4-1234");
  });
});

describe("GET /api/v1/products/:nafdacNo/reference-images/:imageId", () => {
  const IMAGE_ID = "0b6f7a52-0d0e-4f4e-9b1a-2f3c4d5e6f70";

  it("serves the JPEG with an ETag, and 304 when the app already has it", async () => {
    vi.mocked(registryService.getReferenceImage).mockResolvedValue({ data: Buffer.from("jpeg"), etag: '"abc"' });
    const res = await request(app).get(`/api/v1/products/x9-0001/reference-images/${IMAGE_ID}`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers.etag).toBe('"abc"');
    expect(registryService.getReferenceImage).toHaveBeenCalledWith("X9-0001", IMAGE_ID);

    const again = await request(app)
      .get(`/api/v1/products/X9-0001/reference-images/${IMAGE_ID}`)
      .set("Authorization", auth)
      .set("If-None-Match", '"abc"');
    expect(again.status).toBe(304);
  });

  it("422 for a malformed image id", async () => {
    const res = await request(app).get("/api/v1/products/X9-0001/reference-images/nope").set("Authorization", auth);
    expect(res.status).toBe(422);
    expect(registryService.getReferenceImage).not.toHaveBeenCalled();
  });
});

describe("scan history", () => {
  it("pages with defaults and returns pagination meta", async () => {
    vi.mocked(scanService.listForDevice).mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
    });
    const res = await request(app).get("/api/v1/scans").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(scanService.listForDevice).toHaveBeenCalledWith("device-1", 1, 20);
    expect(res.body.meta).toMatchObject({ page: 1, total: 0 });
  });

  it("a malformed scan id is a 422, never a database error", async () => {
    const res = await request(app).get("/api/v1/scans/not-a-uuid").set("Authorization", auth);
    expect(res.status).toBe(422);
    expect(scanService.getForDevice).not.toHaveBeenCalled();
  });
});
