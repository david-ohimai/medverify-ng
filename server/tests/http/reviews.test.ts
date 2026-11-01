import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { deviceService } from "../../src/services/device.service.js";
import { reviewService } from "../../src/services/review/review.service.js";

vi.mock("../../src/services/device.service.js", () => ({ deviceService: { getAuthState: vi.fn() } }));
vi.mock("../../src/services/review/review.service.js", () => ({
  reviewService: { list: vi.fn(), stats: vi.fn(), get: vi.fn(), image: vi.fn(), claim: vi.fn(), decide: vi.fn() },
}));

const app = createApp();
const ID = "6f1c2a8e-3b4d-4c5e-8f90-1a2b3c4d5e6f";
const as = (role: "public" | "regulator") => {
  vi.mocked(deviceService.getAuthState).mockResolvedValue({ role, tokenVersion: 1 });
  return `Bearer ${signAccessToken({ sub: "reviewer-1", role, ver: 1 })}`;
};

beforeEach(() => {
  vi.mocked(deviceService.getAuthState).mockResolvedValue({ role: "regulator", tokenVersion: 1 });
});

describe("review queue API", () => {
  it("is regulator-only, the public can't see other people's scans or photos", async () => {
    const auth = as("public");
    for (const [method, path] of [
      ["get", "/api/v1/reviews"],
      ["get", `/api/v1/reviews/${ID}/image`],
      ["post", `/api/v1/reviews/${ID}/claim`],
    ] as const) {
      expect((await request(app)[method](path).set("Authorization", auth)).status).toBe(403);
    }
  });

  it("lists with status filter and paging", async () => {
    vi.mocked(reviewService.list).mockResolvedValue({ items: [], meta: {} as never });
    const res = await request(app).get("/api/v1/reviews?status=open&limit=5").set("Authorization", as("regulator"));
    expect(res.status).toBe(200);
    expect(reviewService.list).toHaveBeenCalledWith("open", 1, 5);
    expect((await request(app).get("/api/v1/reviews?status=closed").set("Authorization", as("regulator"))).status).toBe(422);
  });

  it("serves the photo uncached", async () => {
    vi.mocked(reviewService.image).mockResolvedValue(Buffer.from("jpeg"));
    const res = await request(app).get(`/api/v1/reviews/${ID}/image`).set("Authorization", as("regulator"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("claims and decides as the reviewer in the token", async () => {
    vi.mocked(reviewService.claim).mockResolvedValue({} as never);
    vi.mocked(reviewService.decide).mockResolvedValue({} as never);
    const auth = as("regulator");
    expect((await request(app).post(`/api/v1/reviews/${ID}/claim`).set("Authorization", auth)).status).toBe(200);
    expect(reviewService.claim).toHaveBeenCalledWith(ID, "reviewer-1");

    const res = await request(app)
      .post(`/api/v1/reviews/${ID}/decision`)
      .set("Authorization", auth)
      .send({ decision: "disagree", reviewedVerdict: "high_risk", note: "Logo differs" });
    expect(res.status).toBe(200);
    expect(reviewService.decide).toHaveBeenCalledWith(ID, "reviewer-1", { decision: "disagree", reviewedVerdict: "high_risk", note: "Logo differs" });
  });

  it("rejects an unknown decision, an unknown verdict and extra fields", async () => {
    const auth = as("regulator");
    for (const body of [{ decision: "maybe" }, { decision: "disagree", reviewedVerdict: "fake" }, { decision: "agree", reviewerId: "someone" }]) {
      expect((await request(app).post(`/api/v1/reviews/${ID}/decision`).set("Authorization", auth).send(body)).status).toBe(422);
    }
    expect(reviewService.decide).not.toHaveBeenCalled();
  });
});
