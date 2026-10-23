import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";

/**
 * Verifies the Bearer access token and attaches the device to req.device.
 * No database call: access tokens live 15 minutes, and role changes issue a
 * new token pair. Makes no business decisions.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;

  if (!token) {
    next(new UnauthorizedError("Missing access token", "TOKEN_MISSING"));
    return;
  }

  try {
    const claims = verifyAccessToken(token);
    req.device = { id: claims.sub, role: claims.role };
    next();
  } catch (err) {
    // The app refreshes on TOKEN_EXPIRED and re-registers on TOKEN_INVALID.
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError("Access token expired", "TOKEN_EXPIRED"));
      return;
    }
    next(new UnauthorizedError("Access token invalid", "TOKEN_INVALID"));
  }
}
