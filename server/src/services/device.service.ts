import { Prisma } from "../generated/prisma/client.js";
import type { DeviceRole } from "../generated/prisma/enums.js";
import { CACHE_TTL, cacheDel, cacheGetJson, cacheKeys, cacheSetJson } from "../lib/cache.js";
import { config } from "../lib/config.js";
import { appEvents } from "../lib/events.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { secureEquals, sha256 } from "../lib/hash.js";
import { deviceRepository, type DeviceRecord } from "../repositories/device.repository.js";
import type {
  ElevateDeviceInput,
  RegisterDeviceInput,
  UpdateDeviceInput,
} from "../validators/device.validator.js";
import { tokenService, type TokenPair } from "./token.service.js";

export interface DeviceSession {
  device: PublicDevice;
  tokens: TokenPair;
}

export type PublicDevice = Pick<DeviceRecord, "id" | "platform" | "appVersion" | "language" | "role" | "createdAt">;

/** What authenticate checks on every request. */
export interface DeviceAuthState {
  role: DeviceRole;
  tokenVersion: number;
}

function toPublic(device: DeviceRecord): PublicDevice {
  return {
    id: device.id,
    platform: device.platform,
    appVersion: device.appVersion,
    language: device.language,
    role: device.role,
    createdAt: device.createdAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Device identity. There are no accounts: the app generates a random install
 * id once, and that id (stored only as a hash) is the device's credential.
 * Plain data in, plain data out — this layer never sees req or res.
 */
export const deviceService = {
  async register(input: RegisterDeviceInput): Promise<DeviceSession> {
    const installIdHash = sha256(input.installId);
    const details = { platform: input.platform, appVersion: input.appVersion, language: input.language };

    let device: DeviceRecord;
    let isNew = false;
    const existing = await deviceRepository.findByInstallIdHash(installIdHash);
    if (existing) {
      device = await deviceRepository.recordReRegistration(existing.id, details);
    } else {
      try {
        device = await deviceRepository.create({ installIdHash, ...details });
        isNew = true;
      } catch (err) {
        // Two first registrations raced and the other one created the row
        // between our lookup and our insert: treat ours as a re-registration.
        if (!isUniqueViolation(err)) throw err;
        const winner = await deviceRepository.findByInstallIdHash(installIdHash);
        if (!winner) throw err;
        device = await deviceRepository.recordReRegistration(winner.id, details);
      }
    }

    if (!isNew) {
      // A re-registration starts a fresh session: older tokens stop working.
      await tokenService.revokeAll(device.id);
      await cacheDel(cacheKeys.deviceAuthState(device.id));
    }

    const tokens = await tokenService.issuePair(device);

    appEvents.emit("device:registered", {
      deviceId: device.id,
      isNew,
      platform: device.platform,
      appVersion: device.appVersion,
    });

    return { device: toPublic(device), tokens };
  },

  /**
   * Role and token version for authenticate, cache-aside in Redis for 60 s.
   * Every write that changes them deletes the cache entry first, so a role
   * change or "delete my data" takes effect on the very next request.
   */
  async getAuthState(deviceId: string): Promise<DeviceAuthState | null> {
    const key = cacheKeys.deviceAuthState(deviceId);
    const cached = await cacheGetJson<DeviceAuthState | { missing: true }>(key);
    if (cached) return "missing" in cached ? null : cached;

    const state = await deviceRepository.findAuthState(deviceId);
    // Cache misses too, so a flood of requests with a deleted device's token
    // doesn't hit the database each time.
    await cacheSetJson(key, state ?? { missing: true }, CACHE_TTL.deviceAuthState);
    return state;
  },

  async getById(deviceId: string): Promise<PublicDevice> {
    const device = await deviceRepository.findById(deviceId);
    if (!device) throw new NotFoundError("Device not found");
    return toPublic(device);
  },

  /** Unlocks regulator mode. The new role goes into a fresh token pair. */
  async elevate(deviceId: string, input: ElevateDeviceInput): Promise<DeviceSession> {
    const device = await deviceRepository.findById(deviceId);
    if (!device) throw new NotFoundError("Device not found");

    if (!secureEquals(input.pin, config.REGULATOR_DEMO_PIN)) {
      appEvents.emit("device:elevation-failed", { deviceId });
      throw new ForbiddenError("Incorrect PIN", "INVALID_PIN");
    }

    const session = await deviceService.changeRole(deviceId, "regulator");
    appEvents.emit("device:elevated", { deviceId });
    return session;
  },

  async demote(deviceId: string): Promise<DeviceSession> {
    const session = await deviceService.changeRole(deviceId, "public");
    appEvents.emit("device:demoted", { deviceId });
    return session;
  },

  /**
   * Role change = new token version (older access tokens are rejected at
   * once), old refresh tokens revoked, cache dropped, fresh pair issued.
   */
  async changeRole(deviceId: string, role: DeviceRole): Promise<DeviceSession> {
    const updated = await deviceRepository.changeRole(deviceId, role);
    await tokenService.revokeAll(deviceId);
    await cacheDel(cacheKeys.deviceAuthState(deviceId));
    const tokens = await tokenService.issuePair(updated);
    return { device: toPublic(updated), tokens };
  },

  async updatePreferences(deviceId: string, input: UpdateDeviceInput): Promise<PublicDevice> {
    const updated = await deviceRepository.updatePreferences(deviceId, input);
    appEvents.emit("device:preferences-updated", { deviceId, changes: { ...input } });
    return toPublic(updated);
  },

  /** "Delete my data" (NDPA 2023). Removes the device; its tokens stop working immediately. */
  async remove(deviceId: string): Promise<void> {
    await deviceRepository.delete(deviceId);
    await cacheDel(cacheKeys.deviceAuthState(deviceId));
    appEvents.emit("device:deleted", { deviceId });
  },
};
