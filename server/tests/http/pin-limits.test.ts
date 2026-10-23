import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { ForbiddenError } from "../../src/lib/errors.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { deviceService } from "../../src/services/device.service.js";

// Its own file so these counters start at zero and don't leak into other tests.
vi.mock("../../src/services/device.service.js", () => ({
  deviceService: { getAuthState: vi.fn(), elevate: vi.fn() },
}));

const service = vi.mocked(deviceService);
const app = createApp();

function tokenFor(deviceId: string) {
  return `Bearer ${signAccessToken({ sub: deviceId, role: "public", ver: 1 })}`;
}

function guess(deviceId: string, pin = "111111") {
  return request(app).post("/api/v1/devices/me/elevate").set("Authorization", tokenFor(deviceId)).send({ pin });
}

beforeEach(() => {
  service.getAuthState.mockResolvedValue({ role: "public", tokenVersion: 1 });
  service.elevate.mockRejectedValue(new ForbiddenError("Incorrect PIN", "INVALID_PIN"));
});

describe("regulator PIN brute-force protection", () => {
  it("a correct PIN doesn't count against the limits", async () => {
    service.elevate.mockResolvedValue({ device: {}, tokens: {} } as never);
    for (let i = 0; i < 8; i++) {
      expect((await guess("device-ok", "246810")).status).toBe(200);
    }
  });

  it("per device: 5 wrong guesses, then 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await guess("device-a")).status);
    expect(statuses).toEqual([403, 403, 403, 403, 403, 429]);
  });

  it("per network: minting fresh devices doesn't buy more guesses (10 wrong per IP per hour)", async () => {
    // The previous test used 6 of this IP's 10. Each new device gets one guess.
    const statuses: number[] = [];
    for (const device of ["device-b", "device-c", "device-d", "device-e", "device-f"]) {
      statuses.push((await guess(device)).status);
    }
    expect(statuses).toEqual([403, 403, 403, 403, 429]);

    const res = await guess("device-g");
    expect(res.status).toBe(429);
    expect(res.body.message).toContain("this network");
  });
});
