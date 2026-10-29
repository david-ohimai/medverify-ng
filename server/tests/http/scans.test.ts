import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { NotFoundError } from "../../src/lib/errors.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { deviceService } from "../../src/services/device.service.js";
import { photoScanService } from "../../src/services/photoScan.service.js";
import { scanService } from "../../src/services/scan.service.js";

vi.mock("../../src/services/device.service.js", () => ({ deviceService: { getAuthState: vi.fn() } }));
vi.mock("../../src/services/photoScan.service.js", () => ({ photoScanService: { submit: vi.fn() } }));
vi.mock("../../src/services/scan.service.js", () => ({ scanService: { getForDevice: vi.fn(), listForDevice: vi.fn() } }));

const app = createApp();
const auth = (role: "public" | "regulator" = "public") =>
  `Bearer ${signAccessToken({ sub: "device-1", role, ver: 1 })}`;
const SCAN_ID = "6f1c2a8e-3b4d-4c5e-8f90-1a2b3c4d5e6f";

beforeEach(() => {
  vi.mocked(deviceService.getAuthState).mockResolvedValue({ role: "public", tokenVersion: 1 });
});

describe("POST /api/v1/scans", () => {
  it("requires a device token", async () => {
    const res = await request(app).post("/api/v1/scans").attach("image", Buffer.from("x"), "pack.jpg");
    expect(res.status).toBe(401);
  });

  it("accepts a photo with 202, a Location header and the stream URL", async () => {
    vi.mocked(photoScanService.submit).mockResolvedValue({
      scanId: SCAN_ID,
      status: "pending",
      eventsUrl: `/api/v1/scans/${SCAN_ID}/events`,
      statusUrl: `/api/v1/scans/${SCAN_ID}`,
    });

    const res = await request(app).post("/api/v1/scans").set("Authorization", auth()).attach("image", Buffer.from("jpeg-bytes"), "pack.jpg");

    expect(res.status).toBe(202);
    expect(res.headers.location).toBe(`/api/v1/scans/${SCAN_ID}`);
    expect(res.body.data).toMatchObject({ scanId: SCAN_ID, status: "pending" });
    // No location sent → null (the app asks permission; it's optional).
    expect(photoScanService.submit).toHaveBeenCalledWith("device-1", Buffer.from("jpeg-bytes"), null);
  });

  it("422 without a photo; 400 for a file in the wrong field", async () => {
    const none = await request(app).post("/api/v1/scans").set("Authorization", auth()).field("note", "hi");
    expect(none.status).toBe(422);

    const wrongField = await request(app).post("/api/v1/scans").set("Authorization", auth()).attach("photo", Buffer.from("x"), "a.jpg");
    expect(wrongField.status).toBe(400);
    expect(photoScanService.submit).not.toHaveBeenCalled();
  });

  it("413 for a photo over 8 MB, cut off while uploading", async () => {
    const res = await request(app)
      .post("/api/v1/scans")
      .set("Authorization", auth())
      .attach("image", Buffer.alloc(8 * 1024 * 1024 + 1), "huge.jpg");
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("GET /api/v1/scans/:id/events", () => {
  it("404 (not a stream) for a scan the device doesn't own", async () => {
    vi.mocked(scanService.getForDevice).mockRejectedValue(new NotFoundError("Scan not found"));
    const res = await request(app).get(`/api/v1/scans/${SCAN_ID}/events`).set("Authorization", auth());
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("422 for a malformed id", async () => {
    const res = await request(app).get("/api/v1/scans/nope/events").set("Authorization", auth());
    expect(res.status).toBe(422);
  });
});

describe("AI control plane", () => {
  it("is regulator-only", async () => {
    const res = await request(app).get("/api/v1/ai/status").set("Authorization", auth());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ROLE_REQUIRED");
  });
});
