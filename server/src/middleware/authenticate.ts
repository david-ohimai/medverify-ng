import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { deviceService } from "../services/device.service.js";

/**
 * Verifies the Bearer access token, then checks it against the device's
 * current state (Redis-cached, 60 s): the device must still exist and the
 * token's version must match. So demote, re-registration and "delete my
 * data" revoke older tokens immediately, not when they expire. The role on
 * req.device comes from that state, never from the token alone.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;

  if (!token) {
    next(new UnauthorizedError("Missing access token", "TOKEN_MISSING"));
    return;
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    // The app refreshes on TOKEN_EXPIRED and TOKEN_REVOKED, re-registers on TOKEN_INVALID.
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError("Access token expired", "TOKEN_EXPIRED"));
      return;
    }
    next(new UnauthorizedError("Access token invalid", "TOKEN_INVALID"));
    return;
  }

  const state = await deviceService.getAuthState(claims.sub);
  if (!state || state.tokenVersion !== claims.ver) {
    next(new UnauthorizedError("Access token revoked", "TOKEN_REVOKED"));
    return;
  }

  req.device = { id: claims.sub, role: state.role };
  next();
}
