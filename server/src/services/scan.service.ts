import { NotFoundError } from "../lib/errors.js";
import type { PaginationMeta } from "../lib/response.js";
import { scanRepository } from "../repositories/scan.repository.js";
import { toVerificationResult, type VerificationResult } from "./verification.service.js";

export const scanService = {
  /** Another device's scan id returns 404, not 403, so ids can't be probed. */
  async getForDevice(deviceId: string, scanId: string): Promise<VerificationResult> {
    const scan = await scanRepository.findForDevice(scanId, deviceId);
    if (!scan) throw new NotFoundError("Scan not found");
    return toVerificationResult(scan);
  },

  async listForDevice(
    deviceId: string,
    page: number,
    limit: number
  ): Promise<{ items: VerificationResult[]; meta: PaginationMeta }> {
    const { items, total } = await scanRepository.listForDevice(deviceId, page, limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      items: items.map(toVerificationResult),
      meta: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  },
};
