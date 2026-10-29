import { llmService } from "../ai/llm.service.js";
import { getActivePrompt } from "../ai/prompts.js";
import type { LabelRead, PackCompare } from "../ai/tasks.js";
import { API_PREFIX } from "../config/constants.js";
import type { ScanLocation } from "../lib/areas.js";
import { cacheGetJson, cacheKeys, cacheSetJson, CACHE_TTL } from "../lib/cache.js";
import { parseExpiry } from "../lib/dates.js";
import { AiQuotaExhaustedError, AiUnavailableError, AppError } from "../lib/errors.js";
import { appEvents } from "../lib/events.js";
import { sha256 } from "../lib/hash.js";
import { prepareImage } from "../lib/image.js";
import { logger } from "../lib/logger.js";
import { isValidNafdacNo, normalizeBatchNo, normalizeNafdacNo } from "../lib/nafdac.js";
import { getCorrelationId } from "../lib/requestContext.js";
import { scanProgress, type ScanProgressEvent } from "../lib/scanProgress.js";
import { getScanQueue, scanImageStore } from "../queues/scan.queue.js";
import { referenceImageRepository } from "../repositories/referenceImage.repository.js";
import { scanRepository } from "../repositories/scan.repository.js";
import { combineSignals, photoSignals, type ComparisonOutcome } from "./risk/photoSignals.js";
import { assessRisk, type RiskAssessment, type Signal } from "./risk/riskScorer.js";
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

export interface LabelFacts {
  nafdacNo: string | null;
  productName: string | null;
  batchNo: string | null;
  expiry: Date | null;
}

/** The facts the registry rules need, taken from what the AI read — only fields it is sure of. */
export function factsFromLabel(label: LabelRead): LabelFacts {
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

export type PhotoAnalysis =
  | {
      outcome: "verdict";
      facts: LabelFacts & { nafdacNo: string };
      productId: string | null;
      signals: Signal[];
      assessment: RiskAssessment;
      /** Everything the AI produced, stored on the scan for review and evaluation. */
      extracted: Record<string, unknown>;
      llmProvider: string;
    }
  | { outcome: "rejected"; code: "NOT_A_MEDICINE_PACK" | "NAFDAC_NO_UNREADABLE"; extracted: Record<string, unknown> };

type Progress = (event: ScanProgressEvent) => Promise<void>;

interface PhotoInput {
  hash: string;
  data: Buffer;
}

async function readLabel(image: PhotoInput, scanId: string | undefined) {
  // Same photo + same prompt version → same reading: served from cache, no quota used.
  const prompt = await getActivePrompt("read_label");
  const key = cacheKeys.labelRead(image.hash, prompt.version);
  const cached = await cacheGetJson<{ label: LabelRead; provider: string; model: string }>(key);
  if (cached) return { ...cached, provider: "cache", promptVersion: prompt.version };

  const result = await llmService.run(
    "read_label",
    [
      { type: "image", mimeType: "image/jpeg", data: image.data },
      { type: "text", text: "Read this medicine pack." },
    ],
    { inputSummary: `pack photo sha256:${image.hash.slice(0, 16)} (${image.data.length} bytes, jpeg)`, ...(scanId ? { scanId } : {}) }
  );

  await cacheSetJson(key, { label: result.data, provider: result.provider, model: result.model }, CACHE_TTL.aiResult);
  return { label: result.data, provider: result.provider, model: result.model, promptVersion: result.promptVersion };
}

/**
 * The photo against the genuine pack's reference photos. Never fails the
 * scan: no reference, or an AI failure, becomes PACK_NOT_COMPARED (which
 * caps confidence) — the registry facts still stand on their own.
 */
async function comparePack(
  image: PhotoInput,
  product: { id: string; name: string },
  scanId: string | undefined
): Promise<{ outcome: ComparisonOutcome; provider?: string; model?: string; promptVersion?: number; references: number }> {
  const references = await referenceImageRepository.forProduct(product.id);
  if (references.length === 0) return { outcome: { status: "no_reference" }, references: 0 };

  const prompt = await getActivePrompt("compare_pack");
  const referenceKey = sha256(references.map((reference) => reference.sha256).join(",")).slice(0, 16);
  const key = cacheKeys.packCompare(image.hash, referenceKey, prompt.version);
  const cached = await cacheGetJson<{ result: PackCompare; provider: string; model: string }>(key);
  if (cached) {
    return {
      outcome: { status: "compared", result: cached.result, productName: product.name },
      provider: "cache",
      model: cached.model,
      promptVersion: prompt.version,
      references: references.length,
    };
  }

  try {
    const result = await llmService.run(
      "compare_pack",
      [
        { type: "text", text: `Reference photos of the genuine ${product.name} pack:` },
        ...references.map((reference) => ({ type: "image" as const, mimeType: "image/jpeg", data: reference.data })),
        { type: "text", text: "Photo of the pack to compare:" },
        { type: "image", mimeType: "image/jpeg", data: image.data },
      ],
      {
        inputSummary: `pack photo sha256:${image.hash.slice(0, 16)} vs ${references.length} reference(s) of ${product.name}`,
        ...(scanId ? { scanId } : {}),
      }
    );
    await cacheSetJson(key, { result: result.data, provider: result.provider, model: result.model }, CACHE_TTL.aiResult);
    return {
      outcome: { status: "compared", result: result.data, productName: product.name },
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      references: references.length,
    };
  } catch (err) {
    if (!(err instanceof AiUnavailableError || err instanceof AiQuotaExhaustedError)) throw err;
    logger.warn({ event: "scan:compare-skipped", scanId, code: err.code }, "Pack comparison unavailable; continuing without it");
    return { outcome: { status: "unavailable" }, references: references.length };
  }
}

function comparisonLabel(outcome: ComparisonOutcome): { status: "done" | "skipped"; label: string; detail?: string } {
  if (outcome.status !== "compared") {
    if (outcome.status === "no_reference") return { status: "skipped", label: "No genuine reference photo yet" };
    if (outcome.status === "unavailable") return { status: "skipped", label: "Pack comparison unavailable right now" };
    return { status: "done", label: "This side couldn't be compared" };
  }
  const { result } = outcome;
  if (!result.comparable) return { status: "done", label: "This side couldn't be compared" };
  const percent = Math.round(result.overall_visual_similarity * 100);
  return {
    status: "done",
    label: result.same_product && percent >= 80 ? "Matches the genuine pack" : "Differs from the genuine pack",
    detail: `${percent}% similar`,
  };
}

/**
 * The whole photo check, without touching the scan row: read the label →
 * registry → batch → compare with the genuine pack → score. Used by the
 * queue worker (which saves the result) and by `npm run eval` (which
 * doesn't). Throws only for failures worth retrying.
 */
export async function analysePhoto(image: PhotoInput, progress: Progress, scanId?: string): Promise<PhotoAnalysis> {
  await progress({ type: "step", step: "read_label", status: "active", label: "Reading the label" });
  const read = await readLabel(image, scanId);
  const facts = factsFromLabel(read.label);
  const extracted: Record<string, unknown> = {
    label: read.label,
    readBy: { provider: read.provider, model: read.model, promptVersion: read.promptVersion },
  };

  if (!read.label.is_medicine_pack) return { outcome: "rejected", code: "NOT_A_MEDICINE_PACK", extracted };
  if (!facts.nafdacNo) return { outcome: "rejected", code: "NAFDAC_NO_UNREADABLE", extracted };
  const nafdacNo = facts.nafdacNo;

  await progress({
    type: "step",
    step: "read_label",
    status: "done",
    label: "Label read",
    detail: [`NAFDAC ${nafdacNo}`, facts.productName, facts.batchNo && `batch ${facts.batchNo}`].filter(Boolean).join(" · "),
  });

  await progress({ type: "step", step: "registry", status: "active", label: "Checking the NAFDAC register" });
  const check = await checkAgainstRegistry({ ...facts, nafdacNo, packNotSeen: false });
  await progress({ type: "step", step: "registry", status: "done", label: check.productFound ? "Found in the register" : "Not in the register" });

  await progress({
    type: "step",
    step: "batch_check",
    status: "done",
    label: !facts.batchNo ? "No batch number read" : check.batchFound ? "Batch checked" : "Batch not in our records",
  });

  // Nothing to compare an unregistered number with.
  let comparison: Awaited<ReturnType<typeof comparePack>> | null = null;
  if (check.productId && check.productName) {
    await progress({ type: "step", step: "compare_pack", status: "active", label: "Comparing with the genuine pack" });
    comparison = await comparePack(image, { id: check.productId, name: check.productName }, scanId);
    await progress({ type: "step", step: "compare_pack", ...comparisonLabel(comparison.outcome) });
    extracted.comparison = {
      ...comparison.outcome,
      references: comparison.references,
      ...(comparison.provider ? { comparedBy: { provider: comparison.provider, model: comparison.model, promptVersion: comparison.promptVersion } } : {}),
    };
  } else {
    await progress({ type: "step", step: "compare_pack", status: "skipped", label: "Nothing to compare: not in the register" });
  }

  const signals = combineSignals(
    check.signals,
    photoSignals({
      label: read.label,
      comparison: comparison?.outcome ?? null,
      registryClean: check.signals.every((signal) => signal.weight <= 0),
    })
  );
  const assessment = assessRisk(signals);
  await progress({ type: "step", step: "score", status: "done", label: "Risk scored", detail: `${assessment.riskScore}/100` });

  return {
    outcome: "verdict",
    facts: { ...facts, nafdacNo },
    productId: check.productId,
    signals,
    assessment,
    extracted,
    llmProvider: read.provider,
  };
}

export const photoScanService = {
  /**
   * Accepts a pack photo: validates and normalises it, records a pending
   * scan and queues the work. Returns at once (202); progress streams over SSE.
   */
  async submit(deviceId: string, upload: Buffer, location: ScanLocation | null = null): Promise<SubmittedScan> {
    if (!llmService.configured) throw new AiUnavailableError("Photo checks aren't set up on this server yet. Type the NAFDAC number in instead.");
    if (!(await llmService.hasCapacity())) throw new AiQuotaExhaustedError();

    const image = await prepareImage(upload);
    const scan = await scanRepository.createPending({ deviceId, imageHash: image.hash, location });

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
   * The worker's job: analyse the photo, publish each step for the live
   * timeline, save the verdict. Throws only for failures worth retrying (AI
   * or infrastructure); a photo that simply can't be read ends as a failed
   * scan with a clear reason.
   */
  async process(scanId: string): Promise<void> {
    const scan = await scanRepository.findForWorker(scanId);
    if (!scan || !scan.imageHash || !(await scanRepository.claim(scanId))) {
      logger.info({ event: "scan:skipped", scanId }, "Scan already finished or missing; nothing to do");
      return;
    }

    const data = await scanImageStore.get(scanId);
    if (!data) {
      await this.fail(scanId, scan.deviceId, "IMAGE_EXPIRED");
      return;
    }

    let analysis: PhotoAnalysis;
    try {
      analysis = await analysePhoto({ hash: scan.imageHash, data }, (event) => scanProgress.publish(scanId, event), scanId);
    } catch (err) {
      // Today's budget won't come back with a retry.
      if (err instanceof AiQuotaExhaustedError) {
        await this.fail(scanId, scan.deviceId, "AI_QUOTA_EXHAUSTED");
        return;
      }
      throw err;
    }

    if (analysis.outcome === "rejected") {
      await this.fail(scanId, scan.deviceId, analysis.code, analysis.extracted);
      return;
    }

    const done = await scanRepository.complete(scanId, {
      nafdacNo: analysis.facts.nafdacNo,
      productName: analysis.facts.productName,
      batchNo: analysis.facts.batchNo,
      expiryDate: analysis.facts.expiry,
      productId: analysis.productId,
      ...analysis.assessment,
      signals: analysis.signals as unknown as object[],
      extracted: analysis.extracted as object,
      llmProvider: analysis.llmProvider,
    });

    if (scan.deviceId) {
      appEvents.emit("scan:completed", {
        scanId,
        deviceId: scan.deviceId,
        kind: "photo",
        verdict: analysis.assessment.verdict,
        riskScore: analysis.assessment.riskScore,
      });
    }
    await scanProgress.publish(scanId, { type: "verdict", scanId, result: toVerificationResult(done) });
    await scanImageStore.remove(scanId);
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
