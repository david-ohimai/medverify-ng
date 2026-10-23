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

/**
 * Device identity. There are no accounts: the app generates a random install
 * id once, and that id (stored only as a hash) is the device's credential.
 * Plain data in, plain data out — this layer never sees req or res.
 */
export const deviceService = {
  async register(input: RegisterDeviceInput): Promise<DeviceSession> {
    const installIdHash = sha256(input.installId);
    const existing = await deviceRepository.findByInstallIdHash(installIdHash);

    const device = existing
      ? await deviceRepository.recordReRegistration(existing.id, {
          platform: input.platform,
          appVersion: input.appVersion,
          language: input.language,
        })
      : await deviceRepository.create({
          installIdHash,
          platform: input.platform,
          appVersion: input.appVersion,
          language: input.language,
        });

    // A re-registration starts a fresh session: older refresh tokens stop working.
    if (existing) await tokenService.revokeAll(device.id);

    const tokens = await tokenService.issuePair(device);

    appEvents.emit("device:registered", {
      deviceId: device.id,
      isNew: !existing,
      platform: device.platform,
      appVersion: device.appVersion,
    });

    return { device: toPublic(device), tokens };
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

    const updated = await deviceRepository.update(deviceId, { role: "regulator" });
    await tokenService.revokeAll(deviceId);
    const tokens = await tokenService.issuePair(updated);

    appEvents.emit("device:elevated", { deviceId });
    return { device: toPublic(updated), tokens };
  },

  async demote(deviceId: string): Promise<DeviceSession> {
    const updated = await deviceRepository.update(deviceId, { role: "public" });
    await tokenService.revokeAll(deviceId);
    const tokens = await tokenService.issuePair(updated);

    appEvents.emit("device:demoted", { deviceId });
    return { device: toPublic(updated), tokens };
  },

  async updatePreferences(deviceId: string, input: UpdateDeviceInput): Promise<PublicDevice> {
    const updated = await deviceRepository.update(deviceId, input);
    appEvents.emit("device:preferences-updated", { deviceId, changes: { ...input } });
    return toPublic(updated);
  },

  /** "Delete my data" (NDPA 2023). Removes the device and every token. */
  async remove(deviceId: string): Promise<void> {
    await deviceRepository.delete(deviceId);
    appEvents.emit("device:deleted", { deviceId });
  },
};
