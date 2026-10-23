import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { deviceService } from "../../src/services/device.service.js";

// HTTP layer only: the service is mocked, so no database or Redis is needed.
vi.mock("../../src/services/device.service.js", () => ({
  deviceService: {
    register: vi.fn(),
    getAuthState: vi.fn(),
    getById: vi.fn(),
    elevate: vi.fn(),
    demote: vi.fn(),
    updatePreferences: vi.fn(),
    remove: vi.fn(),
  },
}));

const service = vi.mocked(deviceService);
const app = createApp();
const INSTALL_ID = "3f1c2b7e-8d4a-4f6b-9c2e-1a5b7d9e0f12";

function bearer(role: "public" | "regulator" = "public", ver = 1) {
  return `Bearer ${signAccessToken({ sub: "device-1", role, ver })}`;
}

beforeEach(() => {
  // By default the device exists at version 1 with the public role.
  service.getAuthState.mockResolvedValue({ role: "public", tokenVersion: 1 });
});

describe("health and platform", () => {
  it("GET /health/live answers without auth", async () => {
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns a correlation id, and reuses a safe one from the caller", async () => {
    const fresh = await request(app).get("/health/live");
    expect(fresh.headers["x-correlation-id"]).toMatch(/^[a-f0-9-]{36}$/);

    const reused = await request(app).get("/health/live").set("X-Correlation-Id", "abc12345-test");
    expect(reused.headers["x-correlation-id"]).toBe("abc12345-test");

    const unsafe = await request(app).get("/health/live").set("X-Correlation-Id", "<script>");
    expect(unsafe.headers["x-correlation-id"]).not.toBe("<script>");
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app).get("/health/live");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("unknown routes return the standard envelope with 404", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, statusCode: 404, code: "ROUTE_NOT_FOUND", data: null });
  });

  it("malformed JSON is a 400 MALFORMED_REQUEST, not a 500", async () => {
    const res = await request(app)
      .post("/api/v1/devices/register")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MALFORMED_REQUEST");
  });

  it("an unsupported charset keeps its real status (415) and reason", async () => {
    const res = await request(app)
      .post("/api/v1/devices/register")
      .set("Content-Type", "application/json; charset=latin1")
      .send("{}");
    expect(res.status).toBe(415);
    expect(res.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(res.body.message).not.toBe("Malformed request body");
  });

  it("serves the OpenAPI spec", async () => {
    const res = await request(app).get("/api-docs.json");
    expect(res.status).toBe(200);
    expect(res.body.paths).toHaveProperty("/api/v1/devices/register");
  });
});

describe("POST /api/v1/devices/register", () => {
  it("rejects invalid input with field-level errors", async () => {
    const res = await request(app).post("/api/v1/devices/register").send({ installId: "not-a-uuid", platform: "windows" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["body.installId", "body.platform", "body.appVersion"]));
    expect(service.register).not.toHaveBeenCalled();
  });

  it("rejects unknown fields (mass assignment)", async () => {
    const res = await request(app)
      .post("/api/v1/devices/register")
      .send({ installId: INSTALL_ID, platform: "android", appVersion: "1.0.0", role: "regulator" });
    expect(res.status).toBe(422);
  });

  it("registers with valid input, applies defaults, and forbids caching the tokens", async () => {
    service.register.mockResolvedValue({ device: { id: "device-1" }, tokens: { accessToken: "a" } } as never);

    const res = await request(app)
      .post("/api/v1/devices/register")
      .send({ installId: INSTALL_ID, platform: "android", appVersion: "1.0.0+1" });

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(service.register).toHaveBeenCalledWith({
      installId: INSTALL_ID,
      platform: "android",
      appVersion: "1.0.0+1",
      language: "en",
    });
  });

  it("sends standard rate limit headers", async () => {
    service.register.mockResolvedValue({ device: {}, tokens: {} } as never);
    const res = await request(app)
      .post("/api/v1/devices/register")
      .send({ installId: INSTALL_ID, platform: "ios", appVersion: "1.0.0" });
    expect(res.headers["ratelimit-policy"]).toBeDefined();
  });
});

describe("protected device routes", () => {
  it("401 TOKEN_MISSING without a token", async () => {
    const res = await request(app).get("/api/v1/devices/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_MISSING");
  });

  it("401 TOKEN_INVALID with a garbage token", async () => {
    const res = await request(app).get("/api/v1/devices/me").set("Authorization", "Bearer not.a.jwt");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_INVALID");
  });

  it("passes the device id from the token to the service", async () => {
    service.getById.mockResolvedValue({ id: "device-1" } as never);
    const res = await request(app).get("/api/v1/devices/me").set("Authorization", bearer());
    expect(res.status).toBe(200);
    expect(service.getById).toHaveBeenCalledWith("device-1");
  });

  it("401 TOKEN_REVOKED when the token's version is older than the device's (after demote / re-register)", async () => {
    service.getAuthState.mockResolvedValue({ role: "public", tokenVersion: 2 });
    const res = await request(app).get("/api/v1/devices/me").set("Authorization", bearer("regulator", 1));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_REVOKED");
    expect(service.getById).not.toHaveBeenCalled();
  });

  it("401 TOKEN_REVOKED when the device was deleted (delete my data)", async () => {
    service.getAuthState.mockResolvedValue(null);
    const res = await request(app).get("/api/v1/devices/me").set("Authorization", bearer());
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_REVOKED");
  });

  it("strips HTML before validation", async () => {
    service.elevate.mockResolvedValue({ device: {}, tokens: {} } as never);
    const res = await request(app)
      .post("/api/v1/devices/me/elevate")
      .set("Authorization", bearer())
      .send({ pin: "<script>alert(1)</script>246810" });
    // The script tag and its body are removed, leaving a valid PIN.
    expect(res.status).toBe(200);
    expect(service.elevate).toHaveBeenCalledWith("device-1", { pin: "246810" });
  });
});
