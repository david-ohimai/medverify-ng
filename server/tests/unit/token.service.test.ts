import { beforeEach, describe, expect, it, vi } from "vitest";
import { appEvents } from "../../src/lib/events.js";
import { verifyAccessToken } from "../../src/lib/tokens.js";
import { refreshTokenRepository } from "../../src/repositories/refreshToken.repository.js";
import { tokenService } from "../../src/services/token.service.js";

vi.mock("../../src/repositories/refreshToken.repository.js", () => ({
  refreshTokenRepository: {
    create: vi.fn(),
    findByHash: vi.fn(),
    rotate: vi.fn(),
    revokeFamily: vi.fn(),
    revokeAllForDevice: vi.fn(),
  },
}));

const repo = vi.mocked(refreshTokenRepository);

function storedToken(overrides: Partial<{ revokedAt: Date | null; expiresAt: Date }> = {}) {
  return {
    id: "token-1",
    deviceId: "device-1",
    familyId: "family-1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    device: { id: "device-1", role: "public" as const },
    ...overrides,
  };
}

describe("tokenService.issuePair", () => {
  beforeEach(() => repo.create.mockResolvedValue({ id: "token-1" }));

  it("returns an access token for the device and stores only the refresh token hash", async () => {
    const pair = await tokenService.issuePair({ id: "device-1", role: "regulator" });

    expect(verifyAccessToken(pair.accessToken)).toEqual({ sub: "device-1", role: "regulator" });
    expect(pair.expiresIn).toBe(900);
    const saved = repo.create.mock.calls[0]?.[0];
    expect(saved?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved?.tokenHash).not.toEqual(pair.refreshToken);
  });
});

describe("tokenService.refresh", () => {
  it("rotates a valid token: new pair, same family", async () => {
    repo.findByHash.mockResolvedValue(storedToken());
    repo.rotate.mockResolvedValue(true);

    const pair = await tokenService.refresh("presented-token-presented-token-presented");

    expect(repo.rotate).toHaveBeenCalledWith("token-1", expect.objectContaining({ familyId: "family-1" }));
    expect(verifyAccessToken(pair.accessToken).sub).toBe("device-1");
  });

  it("rejects an unknown token", async () => {
    repo.findByHash.mockResolvedValue(null);
    await expect(tokenService.refresh("x".repeat(40))).rejects.toMatchObject({ statusCode: 401, code: "REFRESH_INVALID" });
  });

  it("rejects an expired token", async () => {
    repo.findByHash.mockResolvedValue(storedToken({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(tokenService.refresh("x".repeat(40))).rejects.toMatchObject({ code: "REFRESH_EXPIRED" });
    expect(repo.rotate).not.toHaveBeenCalled();
  });

  it("treats a reused token as theft: revokes the whole family and emits an event", async () => {
    repo.findByHash.mockResolvedValue(storedToken({ revokedAt: new Date() }));
    const listener = vi.fn();
    appEvents.once("token:reuse-detected", listener);

    await expect(tokenService.refresh("x".repeat(40))).rejects.toMatchObject({ code: "REFRESH_REUSED" });

    expect(repo.revokeFamily).toHaveBeenCalledWith("family-1");
    expect(listener).toHaveBeenCalledWith({ deviceId: "device-1", familyId: "family-1" });
  });

  it("rejects the loser of two simultaneous refreshes with the same token", async () => {
    repo.findByHash.mockResolvedValue(storedToken());
    repo.rotate.mockResolvedValue(false);
    await expect(tokenService.refresh("x".repeat(40))).rejects.toMatchObject({ code: "REFRESH_REUSED" });
  });
});
