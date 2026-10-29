import { llmService } from "../ai/llm.service.js";
import { getActivePrompt } from "../ai/prompts.js";
import type { LabelRead } from "../ai/tasks.js";
import { API_PREFIX } from "../config/constants.js";
import { cacheGetJson, cacheKeys, cacheSetJson, CACHE_TTL } from "../lib/cache.js";
import { parseExpiry } from "../lib/dates.js";
import { AiQuotaExhaustedError, AiUnavailableError, AppError } from "../lib/errors.js";
import { appEvents } from "../lib/events.js";
import { prepareImage } from "../lib/image.js";
import { logger } from "../lib/logger.js";
import { isValidNafdacNo, normalizeBatchNo, normalizeNafdacNo } from "../lib/nafdac.js";
import { getCorrelationId } from "../lib/requestContext.js";
import { scanProgress } from "../lib/scanProgress.js";
import { getScanQueue, scanImageStore } from "../queues/scan.queue.js";
import { scanRepository } from "../repositories/scan.repository.js";
import { checkAgainstRegistry, SCAN_FAILURES, toVerificationResult } from "./verification.service.js";

/** Below this the model itself isn't sure what it read, so the field is treated as not read. */
export const FIELD_CONFIDENCE_MIN = 0.6;

export interface SubmittedScan {
  scanId: string;
  status: "pending";
  /** SSE stream of pipeline steps and the verdict. */
  eventsUrl: string;
  /** Poll this if the stream drops. */
  statusUrl: string;
}

/** The facts the registry rules need, taken from what the AI read — only fields it is sure of. */
export function factsFromLabel(label: LabelRead): {
  nafdacNo: string | null;
  productName: string | null;
  batchNo: string | null;
  expiry: Date | null;
} {
  const sure = (field: { value: string | null; confidence: number }) =>
    field.value && field.value.trim() && field.confidence >= FIELD_CONFIDENCE_MIN ? field.value.trim() : null;

  const rawNumber = sure(label.nafdac_no);
  const nafdacNo = rawNumber ? normalizeNafdacNo(rawNumber) : null;
  const rawBatch = sure(label.batch_no);
  const batchNo = rawBatch ? normalizeBatchNo(rawBatch) : null;
  const rawExpiry = sure(label.expiry_date);

  return {
    nafdacNo: nafdacNo && isValidNafdacNo(nafdacNo) ? nafdacNo : null,
    productName: sure(label.brand_name) ?? sure(label.generic_name),
    batchNo: batchNo && batchNo.length >= 2 && batchNo.length <= 40 ? batchNo : null,
    expiry: rawExpiry ? parseExpiry(rawExpiry) : null,
  };
}

/** A scan that ended without a verdict for a reason the user can act on. Not retried. */
class ScanRejected extends Error {
  constructor(
    public readonly code: keyof typeof SCAN_FAILURES,
    public readonly extracted?: object
  ) {
    super(code);
  }
}

async function readLabel(scanId: string, imageHash: string, image: Buffer) {
  // Same photo + same prompt version → same reading: served from cache, no quota used.
  const prompt = await getActivePrompt("read_label");
  const key = cacheKeys.labelRead(imageHash, prompt.version);
  const cached = await cacheGetJson<{ label: LabelRead; provider: string; model: string }>(key);
  if (cached) return { ...cached, provider: "cache", promptVersion: prompt.version };

  const result = await llmService.run("read_label", [
    { type: "image", mimeType: "image/jpeg", data: image },
    { type: "text", text: "Read this medicine pack." },
  ], { inputSummary: `pack photo sha256:${imageHash.slice(0, 16)} (${image.length} bytes, jpeg)`, scanId });

  await cacheSetJson(key, { label: result.data, provider: result.provider, model: result.model }, CACHE_TTL.labelRead);
  return { label: result.data, provider: result.provider, model: result.model, promptVersion: result.promptVersion };
}

export const photoScanService = {
  /**
   * Accepts a pack photo: validates and normalises it, records a pending
   * scan and queues the work. Returns at once (202); progress streams over SSE.
   */
  async submit(deviceId: string, upload: Buffer): Promise<SubmittedScan> {
    if (!llmService.configured) throw new AiUnavailableError("Photo checks aren't set up on this server yet. Type the NAFDAC number in instead.");
    if (!(await llmService.hasCapacity())) throw new AiQuotaExhaustedError();

    const image = await prepareImage(upload);
    const scan = await scanRepository.createPending({ deviceId, imageHash: image.hash });

    try {
      await scanImageStore.put(scan.id, image.data);
      await getScanQueue().add("process", { scanId: scan.id, correlationId: getCorrelationId() ?? null }, { jobId: scan.id });
    } catch (err) {
      await scanRepository.fail(scan.id, "INTERNAL_ERROR");
      throw err;
    }

    appEvents.emit("scan:queued", { scanId: scan.id, deviceId });
    await scanProgress.publish(scan.id, {
      type: "step",
      step: "receive",
      status: "done",
      label: "Photo received",
      detail: `${image.width}×${image.height}`,
    });

    return {
      scanId: scan.id,
      status: "pending",
      eventsUrl: `${API_PREFIX}/scans/${scan.id}/events`,
      statusUrl: `${API_PREFIX}/scans/${scan.id}`,
    };
  },

  /**
   * The worker's job: read the label with AI, then run the same registry
   * rules as a typed-in check. Each step is published for the live timeline.
   * Throws only for failures worth retrying (AI or infrastructure); a photo
   * that simply can't be read ends as a failed scan with a clear reason.
   */
  async process(scanId: string): Promise<void> {
    const scan = await scanRepository.findForWorker(scanId);
    if (!scan || !scan.imageHash || !(await scanRepository.claim(scanId))) {
      logger.info({ event: "scan:skipped", scanId }, "Scan already finished or missing; nothing to do");
      return;
    }

    const image = await scanImageStore.get(scanId);
    if (!image) {
      await this.fail(scanId, scan.deviceId, "IMAGE_EXPIRED");
      return;
    }

    try {
      await scanProgress.publish(scanId, { type: "step", step: "read_label", status: "active", label: "Reading the label" });
      const read = await readLabel(scanId, scan.imageHash, image);
      const facts = factsFromLabel(read.label);
      const extracted = { ...read.label, provider: read.provider, model: read.model, promptVersion: read.promptVersion };

      if (!read.label.is_medicine_pack) throw new ScanRejected("NOT_A_MEDICINE_PACK", extracted);
      if (!facts.nafdacNo) throw new ScanRejected("NAFDAC_NO_UNREADABLE", extracted);

      await scanProgress.publish(scanId, {
        type: "step",
        step: "read_label",
        status: "done",
        label: "Label read",
        detail: [`NAFDAC ${facts.nafdacNo}`, facts.productName, facts.batchNo && `batch ${facts.batchNo}`]
          .filter(Boolean)
          .join(" · "),
      });

      await scanProgress.publish(scanId, { type: "step", step: "registry", status: "active", label: "Checking the NAFDAC register" });
      const check = await checkAgainstRegistry({ ...facts, nafdacNo: facts.nafdacNo, packNotSeen: false });
      await scanProgress.publish(scanId, {
        type: "step",
        step: "registry",
        status: "done",
        label: check.productFound ? "Found in the register" : "Not in the register",
      });

      await scanProgress.publish(scanId, {
        type: "step",
        step: "batch_check",
        status: "done",
        label: !facts.batchNo ? "No batch number read" : check.batchFound ? "Batch checked" : "Batch not in our records",
      });
      // Visual comparison with reference packs is the next pipeline step (task compare_pack).
      await scanProgress.publish(scanId, {
        type: "step",
        step: "compare_pack",
        status: "skipped",
        label: "Pack comparison not available yet",
      });

      const done = await scanRepository.complete(scanId, {
        nafdacNo: facts.nafdacNo,
        productName: facts.productName,
        batchNo: facts.batchNo,
        expiryDate: facts.expiry,
        productId: check.productId,
        ...check.assessment,
        signals: check.signals as unknown as object[],
        extracted,
        llmProvider: read.provider,
      });
      await scanProgress.publish(scanId, { type: "step", step: "score", status: "done", label: "Risk scored" });

      if (scan.deviceId) {
        appEvents.emit("scan:completed", {
          scanId,
          deviceId: scan.deviceId,
          kind: "photo",
          verdict: check.assessment.verdict,
          riskScore: check.assessment.riskScore,
        });
      }
      await scanProgress.publish(scanId, { type: "verdict", scanId, result: toVerificationResult(done) });
      await scanImageStore.remove(scanId);
    } catch (err) {
      if (err instanceof ScanRejected) {
        await this.fail(scanId, scan.deviceId, err.code, err.extracted);
        return;
      }
      // Today's budget won't come back with a retry.
      if (err instanceof AiQuotaExhaustedError) {
        await this.fail(scanId, scan.deviceId, "AI_QUOTA_EXHAUSTED");
        return;
      }
      throw err;
    }
  },

  /** Ends a scan without a verdict and tells any open stream why. */
  async fail(scanId: string, deviceId: string | null, code: string, extracted?: object): Promise<void> {
    const changed = await scanRepository.fail(scanId, code, extracted as never);
    await scanImageStore.remove(scanId).catch(() => undefined);
    if (!changed) return;
    appEvents.emit("scan:failed", { scanId, deviceId, failureCode: code });
    await scanProgress.publish(scanId, {
      type: "error",
      scanId,
      code,
      message: SCAN_FAILURES[code] ?? SCAN_FAILURES.INTERNAL_ERROR!,
    });
  },

  /** Failure code for an error that exhausted the job's retries. */
  failureCodeFor(err: unknown): string {
    return err instanceof AppError && err.code in SCAN_FAILURES ? err.code : "INTERNAL_ERROR";
  },
};
