import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { sendSuccess } from "../lib/response.js";
import { deviceService } from "../services/device.service.js";
import { tokenService } from "../services/token.service.js";
import type {
  ElevateDeviceInput,
  RefreshTokenInput,
  RegisterDeviceInput,
  UpdateDeviceInput,
} from "../validators/device.validator.js";

/** Only routes that run authenticate reach these handlers, but stay explicit. */
function deviceId(req: Request): string {
  if (!req.device) throw new UnauthorizedError();
  return req.device.id;
}

/**
 * Translates HTTP to service calls and back. Reads only req.validated and
 * req.device, never touches the database, holds no business rules.
 * Express 5 forwards rejected promises to the error handler, so no try/catch.
 */
export const deviceController = {
  async register(req: Request, res: Response): Promise<void> {
    const session = await deviceService.register(req.validated.body as RegisterDeviceInput);
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, 201, "Device registered", session);
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.validated.body as RefreshTokenInput;
    const tokens = await tokenService.refresh(refreshToken);
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, 200, "Tokens refreshed", { tokens });
  },

  async getMe(req: Request, res: Response): Promise<void> {
    const device = await deviceService.getById(deviceId(req));
    sendSuccess(res, 200, "Device", device);
  },

  async updateMe(req: Request, res: Response): Promise<void> {
    const device = await deviceService.updatePreferences(deviceId(req), req.validated.body as UpdateDeviceInput);
    sendSuccess(res, 200, "Preferences updated", device);
  },

  async elevate(req: Request, res: Response): Promise<void> {
    const session = await deviceService.elevate(deviceId(req), req.validated.body as ElevateDeviceInput);
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, 200, "Regulator mode enabled", session);
  },

  async demote(req: Request, res: Response): Promise<void> {
    const session = await deviceService.demote(deviceId(req));
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, 200, "Regulator mode disabled", session);
  },

  async deleteMe(req: Request, res: Response): Promise<void> {
    await deviceService.remove(deviceId(req));
    sendSuccess(res, 200, "Your data has been deleted", null);
  },
};
