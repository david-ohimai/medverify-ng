import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { requestHotspotRefresh } from "../../src/queues/hotspot.queue.js";
import { deviceService } from "../../src/services/device.service.js";
import { hotspotService } from "../../src/services/hotspot/hotspot.service.js";
import { photoScanService } from "../../src/services/photoScan.service.js";
import { verificationService } from "../../src/services/verification.service.js";

vi.mock("../../src/services/device.service.js", () => ({ deviceService: { getAuthState: vi.fn() } }));
vi.mock("../../src/queues/hotspot.queue.js", () => ({ requestHotspotRefresh: vi.fn() }));
vi.mock("../../src/services/verification.service.js", () => ({ verificationService: { verifyManual: vi.fn() } }));
vi.mock("../../src/services/photoScan.service.js", () => ({ photoScanService: { submit: vi.fn() } }));
vi.mock("../../src/services/hotspot/hotspot.service.js", () => ({
  STATS_WINDOWS: { "24h": 24, "7d": 168, "30d": 720 },
  hotspotService: { listActive: vi.fn(), listAlerts: vi.fn(), stats: vi.fn(), nearby: vi.fn() },
}));

const app = createApp();
const as = (role: "public" | "regulator") => {
  vi.mocked(deviceService.getAuthState).mockResolvedValue({ role, tokenVersion: 1 });
  return `Bearer ${signAccessToken({ sub: "device-1", role, ver: 1 })}`;
};

beforeEach(() => {
  vi.mocked(deviceService.getAuthState).mockResolvedValue({ role: "public", tokenVersion: 1 });
});

describe("regulator hotspot endpoints", () => {
  it("are regulator-only", async () => {
    for (const path of ["/api/v1/hotspots", "/api/v1/hotspots/alerts", "/api/v1/hotspots/stats"]) {
      const res = await request(app).get(path).set("Authorization", as("public"));
      expect(res.status).toBe(403);
    }
    expect(hotspotService.listActive).not.toHaveBeenCalled();
  });

  it("stats default to 7 days and only accept 24h, 7d or 30d", async () => {
    vi.mocked(hotspotService.stats).mockResolvedValue({} as never);
    const auth = as("regulator");
    expect((await request(app).get("/api/v1/hotspots/stats").set("Authorization", auth)).status).toBe(200);
    expect(hotspotService.stats).toHaveBeenCalledWith("7d");
    expect((await request(app).get("/api/v1/hotspots/stats?window=1y").set("Authorization", auth)).status).toBe(422);
  });

  it("refresh queues a run now and answers 202", async () => {
    const res = await request(app).post("/api/v1/hotspots/refresh").set("Authorization", as("regulator"));
    expect(res.status).toBe(202);
    expect(requestHotspotRefresh).toHaveBeenCalledWith("manual");
  });
});

describe("GET /api/v1/alerts/nearby", () => {
  it("any device; lat and lng required; radius defaults to 25 km, max 100", async () => {
    vi.mocked(hotspotService.nearby).mockResolvedValue([]);
    const auth = as("public");
    expect((await request(app).get("/api/v1/alerts/nearby?lat=6.46&lng=3.39").set("Authorization", auth)).status).toBe(200);
    expect(hotspotService.nearby).toHaveBeenCalledWith(6.46, 3.39, 25);
    expect((await request(app).get("/api/v1/alerts/nearby?lat=6.46").set("Authorization", auth)).status).toBe(422);
    expect((await request(app).get("/api/v1/alerts/nearby?lat=6.46&lng=3.39&radiusKm=500").set("Authorization", auth)).status).toBe(422);
  });
});

describe("scan location", () => {
  it("a manual check takes lat and lng together, never one alone", async () => {
    vi.mocked(verificationService.verifyManual).mockResolvedValue({ headline: "x" } as never);
    const auth = as("public");
    const ok = await request(app).post("/api/v1/verify/manual").set("Authorization", auth).send({ nafdacNo: "X9-0001", lat: 6.455, lng: 3.388 });
    expect(ok.status).toBe(201);
    expect(verificationService.verifyManual).toHaveBeenCalledWith("device-1", expect.objectContaining({ lat: 6.455, lng: 3.388 }));

    const half = await request(app).post("/api/v1/verify/manual").set("Authorization", auth).send({ nafdacNo: "X9-0001", lat: 6.455 });
    expect(half.status).toBe(422);
  });

  it("a photo upload passes the location (form fields) rounded to ~1 km", async () => {
    vi.mocked(photoScanService.submit).mockResolvedValue({ scanId: "s", status: "pending", eventsUrl: "", statusUrl: "/x" });
    const res = await request(app)
      .post("/api/v1/scans")
      .set("Authorization", as("public"))
      .field("lat", "6.455312")
      .field("lng", "3.388099")
      .attach("image", Buffer.from("jpeg"), "pack.jpg");
    expect(res.status).toBe(202);
    expect(photoScanService.submit).toHaveBeenCalledWith("device-1", Buffer.from("jpeg"), {
      latitude: 6.46,
      longitude: 3.39,
      areaName: "Idumota market, Lagos",
    });
  });

  it("rejects out-of-range coordinates", async () => {
    const res = await request(app)
      .post("/api/v1/scans")
      .set("Authorization", as("public"))
      .field("lat", "123")
      .field("lng", "3.38")
      .attach("image", Buffer.from("jpeg"), "pack.jpg");
    expect(res.status).toBe(422);
  });
});
