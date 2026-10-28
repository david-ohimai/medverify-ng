import { todayUtc } from "../lib/dates.js";
import { appEvents } from "../lib/events.js";
import { productRepository } from "../repositories/product.repository.js";
import { scanRepository, type ScanRecord } from "../repositories/scan.repository.js";
import type { ManualVerificationInput } from "../validators/verification.validator.js";
import { registryService } from "./registry.service.js";
import { registrySignals } from "./risk/registrySignals.js";
import { adviceFor, assessRisk, DISCLAIMER, type Signal } from "./risk/riskScorer.js";

export interface VerificationResult {
  scanId: string;
  kind: ScanRecord["kind"];
  verdict: ScanRecord["verdict"];
  riskScore: number;
  confidence: ScanRecord["confidence"];
  headline: string;
  advice: string;
  signals: Signal[];
  input: { nafdacNo: string | null; productName: string | null; batchNo: string | null; expiry: string | null };
  product: ScanRecord["product"];
  checkedAt: Date;
  disclaimer: string;
}

/** Shapes a stored scan into what the API returns (also used by scan history). */
export function toVerificationResult(scan: ScanRecord): VerificationResult {
  const signals = scan.signals as unknown as Signal[];
  const { headline, advice } = adviceFor(scan.verdict, signals);
  return {
    scanId: scan.id,
    kind: scan.kind,
    verdict: scan.verdict,
    riskScore: scan.riskScore,
    confidence: scan.confidence,
    headline,
    advice,
    signals,
    input: {
      nafdacNo: scan.nafdacNo,
      productName: scan.productName,
      batchNo: scan.batchNo,
      expiry: scan.expiryDate ? scan.expiryDate.toISOString().slice(0, 7) : null,
    },
    product: scan.product,
    checkedAt: scan.createdAt,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Typed-in verification: registry rules only, no AI and no photo. The same
 * rules and scorer run inside the photo pipeline, after the AI has read the
 * pack — so a manual check and a scan of the same pack agree on the facts.
 */
export const verificationService = {
  async verifyManual(deviceId: string, input: ManualVerificationInput): Promise<VerificationResult> {
    const product = await registryService.findProduct(input.nafdacNo);

    const [nameSimilarity, batch] = await Promise.all([
      product && input.productName ? productRepository.nameSimilarity(product.id, input.productName) : null,
      product && input.batchNo ? productRepository.findBatch(product.id, input.batchNo) : null,
    ]);

    const signals = registrySignals({
      nafdacNo: input.nafdacNo,
      product,
      nameSimilarity,
      batchNo: input.batchNo ?? null,
      batch,
      printedExpiry: input.expiry ?? null,
      packNotSeen: true,
      today: todayUtc(),
    });
    const assessment = assessRisk(signals);

    const scan = await scanRepository.create({
      deviceId,
      kind: "manual",
      nafdacNo: input.nafdacNo,
      productName: input.productName ?? null,
      batchNo: input.batchNo ?? null,
      expiryDate: input.expiry ?? null,
      productId: product?.id ?? null,
      ...assessment,
      signals: signals as unknown as object[],
    });

    appEvents.emit("scan:completed", {
      scanId: scan.id,
      deviceId,
      kind: "manual",
      verdict: assessment.verdict,
      riskScore: assessment.riskScore,
    });

    return toVerificationResult(scan);
  },
};
