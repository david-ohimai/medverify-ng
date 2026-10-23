import { beforeEach, describe, expect, it, vi } from "vitest";
import { appEvents } from "../../src/lib/events.js";
import { sha256 } from "../../src/lib/hash.js";
import { deviceRepository } from "../../src/repositories/device.repository.js";
import { deviceService } from "../../src/services/device.service.js";
import { tokenService } from "../../src/services/token.service.js";

vi.mock("../../src/repositories/device.repository.js", () => ({
  deviceRepository: {
    findById: vi.fn(),
    findByInstallIdHash: vi.fn(),
    create: vi.fn(),
    recordReRegistration: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/services/token.service.js", () => ({
  tokenService: { issuePair: vi.fn(), revokeAll: vi.fn() },
}));

const devices = vi.mocked(deviceRepository);
const tokens = vi.mocked(tokenService);

const INSTALL_ID = "3f1c2b7e-8d4a-4f6b-9c2e-1a5b7d9e0f12";
const PAIR = { accessToken: "a", refreshToken: "r", expiresIn: 900, tokenType: "Bearer" as const };

function device(role: "public" | "regulator" = "public") {
  return {
    id: "device-1",
    platform: "android" as const,
    appVersion: "1.0.0",
    language: "en" as const,
    role,
    createdAt: new Date("2026-10-23T00:00:00Z"),
    lastSeenAt: new Date("2026-10-23T00:00:00Z"),
  };
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
    expect(session.tokens).toBe(PAIR);
    expect(session.device).not.toHaveProperty("installIdHash");
  });

  it("re-registers a known device: resets the role and revokes old sessions", async () => {
    devices.findByInstallIdHash.mockResolvedValue(device("regulator"));
    devices.recordReRegistration.mockResolvedValue(device("public"));
    const listener = vi.fn();
    appEvents.once("device:registered", listener);

    const session = await deviceService.register(input);

    expect(devices.create).not.toHaveBeenCalled();
    expect(tokens.revokeAll).toHaveBeenCalledWith("device-1");
    expect(session.device.role).toBe("public");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "device-1", isNew: false }));
  });
});

describe("deviceService.elevate", () => {
  it("rejects a wrong PIN without changing the role, and emits a security event", async () => {
    devices.findById.mockResolvedValue(device());
    const listener = vi.fn();
    appEvents.once("device:elevation-failed", listener);

    await expect(deviceService.elevate("device-1", { pin: "111111" })).rejects.toMatchObject({
      statusCode: 403,
      code: "INVALID_PIN",
    });

    expect(devices.update).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({ deviceId: "device-1" });
  });

  it("grants the regulator role with the right PIN and issues a fresh token pair", async () => {
    devices.findById.mockResolvedValue(device());
    devices.update.mockResolvedValue(device("regulator"));

    const session = await deviceService.elevate("device-1", { pin: "246810" });

    expect(devices.update).toHaveBeenCalledWith("device-1", { role: "regulator" });
    expect(tokens.revokeAll).toHaveBeenCalledWith("device-1");
    expect(tokens.issuePair).toHaveBeenCalledWith(expect.objectContaining({ role: "regulator" }));
    expect(session.device.role).toBe("regulator");
  });

  it("returns 404 when the device no longer exists", async () => {
    devices.findById.mockResolvedValue(null);
    await expect(deviceService.elevate("gone", { pin: "246810" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
