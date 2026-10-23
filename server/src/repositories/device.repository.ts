import { prisma } from "../lib/prisma.js";
import type { AppLanguage, DevicePlatform, DeviceRole } from "../generated/prisma/enums.js";

/** The fields the rest of the app needs. Never selects the install id hash. */
const deviceSelect = {
  id: true,
  platform: true,
  appVersion: true,
  language: true,
  role: true,
  tokenVersion: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

/** Data access for devices. Every Prisma call for this table lives here. */
export const deviceRepository = {
  findById(id: string) {
    return prisma.device.findUnique({ where: { id }, select: deviceSelect });
  },

  findByInstallIdHash(installIdHash: string) {
    return prisma.device.findUnique({ where: { installIdHash }, select: deviceSelect });
  },

  /** What authenticate needs on every request — two columns, by primary key. */
  findAuthState(id: string) {
    return prisma.device.findUnique({ where: { id }, select: { role: true, tokenVersion: true } });
  },

  create(data: { installIdHash: string; platform: DevicePlatform; appVersion: string; language: AppLanguage }) {
    return prisma.device.create({ data, select: deviceSelect });
  },

  /**
   * Re-registration resets the role (regulator mode always needs the PIN
   * again) and bumps the token version, so every older access token dies.
   */
  recordReRegistration(id: string, data: { platform: DevicePlatform; appVersion: string; language: AppLanguage }) {
    return prisma.device.update({
      where: { id },
      data: { ...data, role: "public", tokenVersion: { increment: 1 }, lastSeenAt: new Date() },
      select: deviceSelect,
    });
  },

  /** A role change always bumps the token version: old tokens carry the old role. */
  changeRole(id: string, role: DeviceRole) {
    return prisma.device.update({
      where: { id },
      data: { role, tokenVersion: { increment: 1 } },
      select: deviceSelect,
    });
  },

  updatePreferences(id: string, data: { language?: AppLanguage }) {
    return prisma.device.update({ where: { id }, data, select: deviceSelect });
  },

  /** Refresh tokens cascade; audit rows keep their history with device_id set to null. */
  delete(id: string) {
    return prisma.device.delete({ where: { id }, select: { id: true } });
  },
};

export type DeviceRecord = NonNullable<Awaited<ReturnType<typeof deviceRepository.findById>>>;
