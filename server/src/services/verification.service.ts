import { todayUtc } from "../lib/dates.js";
import { appEvents } from "../lib/events.js";
import { productRepository } from "../repositories/product.repository.js";
import { scanRepository, type ScanRecord } from "../repositories/scan.repository.js";
import type { ManualVerificationInput } from "../validators/verification.validator.js";
import { registryService } from "./registry.service.js";
import { registrySignals } from "./risk/registrySignals.js";
import { adviceFor, assessRisk, DISCLAIMER, type RiskAssessment, type Signal } from "./risk/riskScorer.js";

/** Why a photo scan ended without a verdict, in words the user can act on. */
export const SCAN_FAILURES: Record<string, string> = {
  NOT_A_MEDICINE_PACK: "This doesn't look like a medicine pack. Photograph the side that shows the NAFDAC number.",
  NAFDAC_NO_UNREADABLE: "We couldn't read a NAFDAC number. Retake the photo in good light, or type the number in.",
  IMAGE_EXPIRED: "The photo expired before it could be checked. Please scan again.",
  AI_UNAVAILABLE: "The AI service is unavailable right now. Please try again shortly, or type the details in.",
  AI_QUOTA_EXHAUSTED: "Photo checks are paused for today (free AI limit reached). You can still type the NAFDAC number in.",
  INTERNAL_ERROR: "Something went wrong while checking this photo. Please try again.",
};

export interface VerificationResult {
  scanId: string;
  kind: ScanRecord["kind"];
  /** pending → processing → done | failed. Manual checks are always done. */
  status: ScanRecord["status"];
  verdict: ScanRecord["verdict"];
  riskScore: number | null;
  confidence: ScanRecord["confidence"];
  headline: string;
  advice: string;
  signals: Signal[];
  failure: { code: string; message: string } | null;
  input: { nafdacNo: string | null; productName: string | null; batchNo: string | null; expiry: string | null };
  product: ScanRecord["product"];
  checkedAt: Date;
  completedAt: Date | null;
  disclaimer: string;
}

function headlineFor(scan: ScanRecord, signals: Signal[]): { headline: string; advice: string } {
  if (scan.status === "done" && scan.verdict) return adviceFor(scan.verdict, signals);
  if (scan.status === "failed") {
    return {
      headline: "Couldn't check this photo",
      advice: SCAN_FAILURES[scan.failureCode ?? "INTERNAL_ERROR"] ?? SCAN_FAILURES.INTERNAL_ERROR!,
    };
  }
  return { headline: "Checking your pack…", advice: "This usually takes a few seconds." };
}

/** Shapes a stored scan into what the API returns (also used by scan history and the SSE verdict). */
export function toVerificationResult(scan: ScanRecord): VerificationResult {
  const signals = scan.signals as unknown as Signal[];
  const { headline, advice } = headlineFor(scan, signals);
  return {
    scanId: scan.id,
    kind: scan.kind,
    status: scan.status,
    verdict: scan.verdict,
    riskScore: scan.riskScore,
    confidence: scan.confidence,
    headline,
    advice,
    signals,
    failure:
      scan.status === "failed"
        ? { code: scan.failureCode ?? "INTERNAL_ERROR", message: advice }
        : null,
    input: {
      nafdacNo: scan.nafdacNo,
      productName: scan.productName,
      batchNo: scan.batchNo,
      expiry: scan.expiryDate ? scan.expiryDate.toISOString().slice(0, 7) : null,
    },
    product: scan.product,
    checkedAt: scan.createdAt,
    completedAt: scan.completedAt,
    disclaimer: DISCLAIMER,
  };
}

export interface RegistryCheckFacts {
  nafdacNo: string;
  productName: string | null;
  batchNo: string | null;
  expiry: Date | null;
  /** True for typed-in checks: nobody has looked at the physical pack. */
  packNotSeen: boolean;
}

export interface RegistryCheck {
  productId: string | null;
  /** Brand name of the registered product, when found. */
  productName: string | null;
  productFound: boolean;
  batchFound: boolean;
  signals: Signal[];
  assessment: RiskAssessment;
}

/**
 * Registry rules for one set of facts. Used by typed-in checks and by the
 * photo pipeline after the AI has read the pack, so both agree on the facts.
 */
export async function checkAgainstRegistry(facts: RegistryCheckFacts): Promise<RegistryCheck> {
  const product = await registryService.findProduct(facts.nafdacNo);

  const [nameSimilarity, batch] = await Promise.all([
    product && facts.productName ? productRepository.nameSimilarity(product.id, facts.productName) : null,
    product && facts.batchNo ? productRepository.findBatch(product.id, facts.batchNo) : null,
  ]);

  const signals = registrySignals({
    nafdacNo: facts.nafdacNo,
    product,
    nameSimilarity,
    batchNo: facts.batchNo,
    batch,
    printedExpiry: facts.expiry,
    packNotSeen: facts.packNotSeen,
    today: todayUtc(),
  });

  return {
    productId: product?.id ?? null,
    productName: product?.brandName ?? null,
    productFound: product !== null,
    batchFound: batch !== null,
    signals,
    assessment: assessRisk(signals),
  };
}

/**
 * Typed-in verification: registry rules only, no AI and no photo.
 */
export const verificationService = {
  async verifyManual(deviceId: string, input: ManualVerificationInput): Promise<VerificationResult> {
    const facts = {
      nafdacNo: input.nafdacNo,
      productName: input.productName ?? null,
      batchNo: input.batchNo ?? null,
      expiry: input.expiry ?? null,
    };
    const check = await checkAgainstRegistry({ ...facts, packNotSeen: true });

    const scan = await scanRepository.create({
      deviceId,
      kind: "manual",
      nafdacNo: facts.nafdacNo,
      productName: facts.productName,
      batchNo: facts.batchNo,
      expiryDate: facts.expiry,
      productId: check.productId,
      ...check.assessment,
      signals: check.signals as unknown as object[],
    });

    appEvents.emit("scan:completed", {
      scanId: scan.id,
      deviceId,
      kind: "manual",
      verdict: check.assessment.verdict,
      riskScore: check.assessment.riskScore,
    });

    return toVerificationResult(scan);
  },
};
