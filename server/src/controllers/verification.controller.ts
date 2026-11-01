import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { sendSuccess } from "../lib/response.js";
import { scanService } from "../services/scan.service.js";
import { speechService } from "../services/speech.service.js";
import { verificationService } from "../services/verification.service.js";
import type { ListScansQuery, ScanParams, ScanSpeechInput } from "../validators/scan.validator.js";
import type { ManualVerificationInput } from "../validators/verification.validator.js";

function deviceId(req: Request): string {
  if (!req.device) throw new UnauthorizedError();
  return req.device.id;
}

export const verificationController = {
  async verifyManual(req: Request, res: Response): Promise<void> {
    const result = await verificationService.verifyManual(deviceId(req), req.validated.body as ManualVerificationInput);
    sendSuccess(res, 201, result.headline, result);
  },

  async listScans(req: Request, res: Response): Promise<void> {
    const { page, limit } = req.validated.query as ListScansQuery;
    const { items, meta } = await scanService.listForDevice(deviceId(req), page, limit);
    sendSuccess(res, 200, "Scan history", items, meta);
  },

  async speech(req: Request, res: Response): Promise<void> {
    const { params, query } = req.validated as unknown as ScanSpeechInput;
    const speech = await speechService.forScan(deviceId(req), params.id, query.lang);
    sendSuccess(res, 200, "Verdict to read aloud", speech);
  },

  async getScan(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as ScanParams;
    const scan = await scanService.getForDevice(deviceId(req), id);
    sendSuccess(res, 200, "Scan", scan);
  },
};
