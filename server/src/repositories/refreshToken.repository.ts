import { prisma } from "../lib/prisma.js";

/** Data access for refresh tokens. Only hashes are ever stored or queried. */
export const refreshTokenRepository = {
  create(data: { deviceId: string; tokenHash: string; familyId: string; expiresAt: Date }) {
    return prisma.refreshToken.create({ data, select: { id: true } });
  },

  findByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        deviceId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
        device: { select: { id: true, role: true, tokenVersion: true } },
      },
    });
  },

  /**
   * Revokes the presented token and stores its replacement in one transaction,
   * and only if the token is still unrevoked — two concurrent refreshes with
   * the same token can't both succeed.
   */
  async rotate(
    currentId: string,
    replacement: { deviceId: string; tokenHash: string; familyId: string; expiresAt: Date }
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "rotated" },
      });
      if (revoked.count === 0) return false;
      await tx.refreshToken.create({ data: replacement });
      return true;
    });
  },

  revokeFamily(familyId: string) {
    return prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "reuse_detected" },
    });
  },

  revokeAllForDevice(deviceId: string) {
    return prisma.refreshToken.updateMany({
      where: { deviceId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "session_reset" },
    });
  },
};
