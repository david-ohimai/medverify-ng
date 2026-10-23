import { prisma } from "../lib/prisma.js";
import type { AppLanguage, DevicePlatform, DeviceRole } from "../generated/prisma/enums.js";

/** The fields the rest of the app needs. Never selects the install id hash. */
const deviceSelect = {
  id: true,
  platform: true,
  appVersion: true,
  language: true,
  role: true,
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

  create(data: { installIdHash: string; platform: DevicePlatform; appVersion: string; language: AppLanguage }) {
    return prisma.device.create({ data, select: deviceSelect });
  },

  /** Re-registration resets the role: regulator mode always needs the PIN again. */
  recordReRegistration(id: string, data: { platform: DevicePlatform; appVersion: string; language: AppLanguage }) {
    return prisma.device.update({
      where: { id },
      data: { ...data, role: "public", lastSeenAt: new Date() },
      select: deviceSelect,
    });
  },

  update(id: string, data: { language?: AppLanguage; role?: DeviceRole; lastSeenAt?: Date }) {
    return prisma.device.update({ where: { id }, data, select: deviceSelect });
  },

  /** Refresh tokens cascade; audit rows keep their history with device_id set to null. */
  delete(id: string) {
    return prisma.device.delete({ where: { id }, select: { id: true } });
  },
};

export type DeviceRecord = NonNullable<Awaited<ReturnType<typeof deviceRepository.findById>>>;
