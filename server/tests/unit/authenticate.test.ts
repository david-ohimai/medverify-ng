import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { authenticate } from "../../src/middleware/authenticate.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { deviceService } from "../../src/services/device.service.js";

vi.mock("../../src/services/device.service.js", () => ({
  deviceService: { getAuthState: vi.fn() },
}));

const getAuthState = vi.mocked(deviceService.getAuthState);

async function run(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` } } as Request;
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  await authenticate(req, {} as Response, next);
  return { req, next };
}

describe("authenticate", () => {
  it("takes the role from the device's current state, not from the token", async () => {
    getAuthState.mockResolvedValue({ role: "public", tokenVersion: 3 });
    // A token that still says "regulator" (e.g. issued before a demote at the same version).
    const { req, next } = await run(signAccessToken({ sub: "device-1", role: "regulator", ver: 3 }));

    expect(next).toHaveBeenCalledWith();
    expect(req.device).toEqual({ id: "device-1", role: "public" });
  });

  it("rejects a token whose version is behind the device's", async () => {
    getAuthState.mockResolvedValue({ role: "regulator", tokenVersion: 4 });
    const { req, next } = await run(signAccessToken({ sub: "device-1", role: "regulator", ver: 3 }));

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: "TOKEN_REVOKED" }));
    expect(req.device).toBeUndefined();
  });
});
