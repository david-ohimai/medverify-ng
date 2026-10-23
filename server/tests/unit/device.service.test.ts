import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { cacheDel, cacheGetJson, cacheSetJson } from "../../src/lib/cache.js";
import { appEvents } from "../../src/lib/events.js";
import { sha256 } from "../../src/lib/hash.js";
import { deviceRepository } from "../../src/repositories/device.repository.js";
import { deviceService } from "../../src/services/device.service.js";
import { tokenService } from "../../src/services/token.service.js";

vi.mock("../../src/repositories/device.repository.js", () => ({
  deviceRepository: {
    findById: vi.fn(),
    findByInstallIdHash: vi.fn(),
    findAuthState: vi.fn(),
    create: vi.fn(),
    recordReRegistration: vi.fn(),
    changeRole: vi.fn(),
    updatePreferences: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/services/token.service.js", () => ({
  tokenService: { issuePair: vi.fn(), revokeAll: vi.fn() },
}));

vi.mock("../../src/lib/cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/cache.js")>()),
  cacheGetJson: vi.fn(),
  cacheSetJson: vi.fn(),
  cacheDel: vi.fn(),
}));

const devices = vi.mocked(deviceRepository);
const tokens = vi.mocked(tokenService);
const cacheGet = vi.mocked(cacheGetJson);
const cacheSet = vi.mocked(cacheSetJson);
const cacheDelete = vi.mocked(cacheDel);

const INSTALL_ID = "3f1c2b7e-8d4a-4f6b-9c2e-1a5b7d9e0f12";
const PAIR = { accessToken: "a", refreshToken: "r", expiresIn: 900, tokenType: "Bearer" as const };

function device(role: "public" | "regulator" = "public", tokenVersion = 1) {
  return {
    id: "device-1",
    platform: "android" as const,
    appVersion: "1.0.0",
    language: "en" as const,
    role,
    tokenVersion,
    createdAt: new Date("2026-10-23T00:00:00Z"),
    lastSeenAt: new Date("2026-10-23T00:00:00Z"),
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.10.1" });
}

beforeEach(() => {
  tokens.issuePair.mockResolvedValue(PAIR);
});

describe("deviceService.register", () => {
  const input = { installId: INSTALL_ID, platform: "android" as const, appVersion: "1.0.0", language: "en" as const };

  it("creates a new device, storing only the hash of the install id", async () => {
    devices.findByInstallIdHash.mockResolvedValue(null);
    devices.create.mockResolvedValue(device());

    const session = await deviceService.register(input);

    expect(devices.create).toHaveBeenCalledWith(expect.objectContaining({ installIdHash: sha256(INSTALL_ID) }));
    expect(JSON.stringify(devices.create.mock.calls)).not.toContain(INSTALL_ID);
    expect(tokens.revokeAll).not.toHaveBeenCalled();
    expect(session.tokens).toBe(PAIR);
    expect(session.device).not.toHaveProperty("installIdHash");
  });

  it("re-registers a known device: resets the role, revokes old sessions, drops the auth cache", async () => {
    devices.findByInstallIdHash.mockResolvedValue(device("regulator", 4));
    devices.recordReRegistration.mockResolvedValue(device("public", 5));
    const listener = vi.fn();
    appEvents.once("device:registered", listener);

    const session = await deviceService.register(input);

    expect(devices.create).not.toHaveBeenCalled();
    expect(tokens.revokeAll).toHaveBeenCalledWith("device-1");
    expect(cacheDelete).toHaveBeenCalledWith("device-auth:device-1");
    expect(tokens.issuePair).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 5 }));
    expect(session.device.role).toBe("public");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "device-1", isNew: false }));
  });

  it("survives two first registrations racing: the loser of the insert re-registers instead of failing", async () => {
    devices.findByInstallIdHash.mockResolvedValueOnce(null).mockResolvedValueOnce(device());
    devices.create.mockRejectedValue(uniqueViolation());
    devices.recordReRegistration.mockResolvedValue(device("public", 2));

    const session = await deviceService.register(input);

    expect(devices.recordReRegistration).toHaveBeenCalledWith("device-1", expect.any(Object));
    expect(session.device.id).toBe("device-1");
  });

  it("still fails on other database errors", async () => {
    devices.findByInstallIdHash.mockResolvedValue(null);
    devices.create.mockRejectedValue(new Error("connection lost"));
    await expect(deviceService.register(input)).rejects.toThrow("connection lost");
  });
});

describe("deviceService.getAuthState", () => {
  it("serves from cache without touching the database", async () => {
    cacheGet.mockResolvedValue({ role: "regulator", tokenVersion: 2 });
    expect(await deviceService.getAuthState("device-1")).toEqual({ role: "regulator", tokenVersion: 2 });
    expect(devices.findAuthState).not.toHaveBeenCalled();
  });

  it("on a miss reads the database and caches the result for 60 s", async () => {
    cacheGet.mockResolvedValue(undefined);
    devices.findAuthState.mockResolvedValue({ role: "public", tokenVersion: 1 });

    expect(await deviceService.getAuthState("device-1")).toEqual({ role: "public", tokenVersion: 1 });
    expect(cacheSet).toHaveBeenCalledWith("device-auth:device-1", { role: "public", tokenVersion: 1 }, 60);
  });

  it("remembers deleted devices too, so their tokens don't hit the database on every request", async () => {
    cacheGet.mockResolvedValueOnce(undefined);
    devices.findAuthState.mockResolvedValue(null);
    expect(await deviceService.getAuthState("gone")).toBeNull();
    expect(cacheSet).toHaveBeenCalledWith("device-auth:gone", { missing: true }, 60);

    cacheGet.mockResolvedValueOnce({ missing: true });
    expect(await deviceService.getAuthState("gone")).toBeNull();
    expect(devices.findAuthState).toHaveBeenCalledTimes(1);
  });
});

describe("deviceService.elevate / demote / remove", () => {
  it("rejects a wrong PIN without changing the role, and emits a security event", async () => {
    devices.findById.mockResolvedValue(device());
    const listener = vi.fn();
    appEvents.once("device:elevation-failed", listener);

    await expect(deviceService.elevate("device-1", { pin: "111111" })).rejects.toMatchObject({
      statusCode: 403,
      code: "INVALID_PIN",
    });

    expect(devices.changeRole).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({ deviceId: "device-1" });
  });

  it("right PIN: role changes (bumping the token version), old tokens revoked, cache dropped, new pair issued", async () => {
    devices.findById.mockResolvedValue(device("public", 1));
    devices.changeRole.mockResolvedValue(device("regulator", 2));

    const session = await deviceService.elevate("device-1", { pin: "246810" });

    expect(devices.changeRole).toHaveBeenCalledWith("device-1", "regulator");
    expect(tokens.revokeAll).toHaveBeenCalledWith("device-1");
    expect(cacheDelete).toHaveBeenCalledWith("device-auth:device-1");
    expect(tokens.issuePair).toHaveBeenCalledWith(expect.objectContaining({ role: "regulator", tokenVersion: 2 }));
    expect(session.device.role).toBe("regulator");
  });

  it("demote goes through the same path", async () => {
    devices.changeRole.mockResolvedValue(device("public", 3));
    await deviceService.demote("device-1");
    expect(devices.changeRole).toHaveBeenCalledWith("device-1", "public");
    expect(cacheDelete).toHaveBeenCalledWith("device-auth:device-1");
  });

  it("delete my data drops the cached auth state so the token dies on the next request", async () => {
    devices.delete.mockResolvedValue({ id: "device-1" });
    await deviceService.remove("device-1");
    expect(cacheDelete).toHaveBeenCalledWith("device-auth:device-1");
  });

  it("returns 404 when the device no longer exists", async () => {
    devices.findById.mockResolvedValue(null);
    await expect(deviceService.elevate("gone", { pin: "246810" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
