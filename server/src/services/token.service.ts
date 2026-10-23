import { randomUUID } from "node:crypto";
import { appEvents } from "../lib/events.js";
import { UnauthorizedError } from "../lib/errors.js";
import { sha256 } from "../lib/hash.js";
import { accessTokenTtlSeconds, createRefreshToken, signAccessToken } from "../lib/tokens.js";
import { refreshTokenRepository } from "../repositories/refreshToken.repository.js";
import type { DeviceRole } from "../generated/prisma/enums.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  tokenType: "Bearer";
}

/** What a token pair is issued for. */
export interface TokenSubject {
  id: string;
  role: DeviceRole;
  tokenVersion: number;
}

/**
 * Issues and rotates tokens. A 15-minute access token (JWT) authorises
 * requests; a 30-day refresh token (opaque, stored hashed) gets new ones.
 * Every refresh replaces the refresh token, and presenting one that was
 * already rotated revokes the whole chain — a stolen token stops working.
 */
export const tokenService = {
  async issuePair(device: TokenSubject, familyId: string = randomUUID()): Promise<TokenPair> {
    const refresh = createRefreshToken();
    await refreshTokenRepository.create({
      deviceId: device.id,
      tokenHash: refresh.tokenHash,
      familyId,
      expiresAt: refresh.expiresAt,
    });

    return {
      accessToken: signAccessToken({ sub: device.id, role: device.role, ver: device.tokenVersion }),
      refreshToken: refresh.token,
      expiresIn: accessTokenTtlSeconds(),
      tokenType: "Bearer",
    };
  },

  async refresh(presentedToken: string): Promise<TokenPair> {
    const record = await refreshTokenRepository.findByHash(sha256(presentedToken));

    if (!record) {
      throw new UnauthorizedError("Refresh token invalid", "REFRESH_INVALID");
    }

    if (record.revokedAt) {
      if (record.revokedReason === "rotated") {
        // A token that was already swapped for a newer one came back: someone
        // kept a copy. Kill the whole chain.
        await refreshTokenRepository.revokeFamily(record.familyId);
        appEvents.emit("token:reuse-detected", { deviceId: record.deviceId, familyId: record.familyId });
        throw new UnauthorizedError("Refresh token already used", "REFRESH_REUSED");
      }
      // Ended by a session reset (re-registration, role change) or by an
      // earlier reuse detection: stale, not an attack. No security event.
      throw new UnauthorizedError("Refresh token invalid", "REFRESH_INVALID");
    }

    if (record.expiresAt <= new Date()) {
      throw new UnauthorizedError("Refresh token expired", "REFRESH_EXPIRED");
    }

    const next = createRefreshToken();
    const rotated = await refreshTokenRepository.rotate(record.id, {
      deviceId: record.deviceId,
      tokenHash: next.tokenHash,
      familyId: record.familyId,
      expiresAt: next.expiresAt,
    });

    if (!rotated) {
      // Lost a race with another refresh using the same token.
      throw new UnauthorizedError("Refresh token already used", "REFRESH_REUSED");
    }

    appEvents.emit("token:refreshed", { deviceId: record.deviceId });

    return {
      accessToken: signAccessToken({
        sub: record.device.id,
        role: record.device.role,
        ver: record.device.tokenVersion,
      }),
      refreshToken: next.token,
      expiresIn: accessTokenTtlSeconds(),
      tokenType: "Bearer",
    };
  },

  revokeAll(deviceId: string) {
    return refreshTokenRepository.revokeAllForDevice(deviceId);
  },
};
