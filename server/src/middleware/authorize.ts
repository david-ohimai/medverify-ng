import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import type { DeviceRole } from "../generated/prisma/enums.js";

/**
 * Role guard. Must run AFTER authenticate. No database calls.
 *   router.get("/hotspots", authenticate, authorize("regulator"), ...)
 */
export function authorize(...roles: DeviceRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.device) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.device.role)) {
      next(new ForbiddenError("This action needs regulator mode", "ROLE_REQUIRED"));
      return;
    }
    next();
  };
}
