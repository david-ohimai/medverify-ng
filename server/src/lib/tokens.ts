import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "./config.js";
import { randomToken, sha256 } from "./hash.js";
import type { DeviceRole } from "../generated/prisma/enums.js";

const ALGORITHM = "HS256" as const;
const ISSUER = "medverify-api";
const AUDIENCE = "medverify-app";

export interface AccessTokenClaims {
  /** Device id. */
  sub: string;
  role: DeviceRole;
  /** Device token version when the token was issued (see Device.tokenVersion). */
  ver: number;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign({ role: claims.role, ver: claims.ver, typ: "access" }, config.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: config.ACCESS_TOKEN_TTL as NonNullable<SignOptions["expiresIn"]>,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: claims.sub,
  });
}

/**
 * Verifies signature, expiry, issuer, audience and token type, and pins the
 * algorithm so a token signed with "none" or another algorithm is rejected.
 * Throws jsonwebtoken's TokenExpiredError / JsonWebTokenError on failure.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (typeof payload === "string" || payload.typ !== "access" || typeof payload.sub !== "string") {
    throw new jwt.JsonWebTokenError("Not an access token");
  }
  if (payload.role !== "public" && payload.role !== "regulator") {
    throw new jwt.JsonWebTokenError("Unknown role");
  }
  if (!Number.isInteger(payload.ver)) {
    throw new jwt.JsonWebTokenError("Missing token version");
  }

  return { sub: payload.sub, role: payload.role, ver: payload.ver as number };
}

/** Seconds until an access token expires — sent to the app as `expiresIn`. */
export function accessTokenTtlSeconds(): number {
  const match = /^(\d+)([smhd])$/.exec(config.ACCESS_TOKEN_TTL);
  const amount = Number(match?.[1] ?? 15);
  const unit = match?.[2] ?? "m";
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 60;
  return amount * multiplier;
}

/**
 * Refresh tokens are opaque random strings, not JWTs. Only their SHA-256 hash
 * is stored, so a database leak does not leak usable tokens.
 */
export function createRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: sha256(token), expiresAt };
}
