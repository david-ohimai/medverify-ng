import type { Signal } from "./riskScorer.js";

/** How closely a typed/read product name must match the registry to count as the same product (pg_trgm, 0–1). */
export const NAME_MATCH_THRESHOLD = 0.45;

export interface RegistryProductFacts {
  nafdacNo: string;
  brandName: string;
  status: "active" | "expired" | "cancelled";
  source: "greenbook" | "pack_label" | "nafdac_alert" | "demo";
}

export interface RegistryBatchFacts {
  batchNo: string;
  expiryDate: Date | null;
  recalled: boolean;
  recallNote: string | null;
}

export interface RegistryCheckInput {
  nafdacNo: string;
  /** The product found under that number, or null if it isn't registered. */
  product: RegistryProductFacts | null;
  /** Similarity between the name on the pack and the registered names, when a name was given. */
  nameSimilarity: number | null;
  batchNo: string | null;
  /** The batch found in the registry, or null if unknown / not given. */
  batch: RegistryBatchFacts | null;
  /** Expiry as printed on the pack, when given. */
  printedExpiry: Date | null;
  /** True for typed-in checks: nobody has looked at the physical pack. */
  packNotSeen: boolean;
  today: Date;
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
/** Packs print expiry as a month ("08/2027"), so expiries are compared by month. */
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/**
 * The registry rules, as data: each fact about the product, name, batch and
 * expiry becomes a weighted, explained signal. No I/O — the caller looks the
 * facts up; this decides what they mean.
 */
export function registrySignals(input: RegistryCheckInput): Signal[] {
  const signals: Signal[] = [];
  const { product } = input;

  if (input.packNotSeen) {
    signals.push({
      code: "PACK_NOT_SEEN",
      label: "Typed-in check: the pack itself wasn't examined",
      weight: 0,
      severity: "info",
      detail: "Fakes often copy real numbers. Scan the pack for a fuller check.",
    });
  }

  if (!product) {
    signals.push({
      code: "NOT_IN_REGISTRY",
      label: `NAFDAC number ${input.nafdacNo} is not in the register`,
      weight: 45,
      severity: "danger",
    });
    return signals;
  }

  if (product.source === "demo") {
    signals.push({
      code: "DEMO_RECORD",
      label: "Demo record — fictional data, not a real NAFDAC registration",
      weight: 0,
      severity: "warning",
      detail: "This result comes from MedVerify's made-up test data and says nothing about a real medicine.",
    });
  }

  if (product.status !== "active") {
    signals.push({
      code: "REGISTRATION_INACTIVE",
      label: `This registration is ${product.status}`,
      weight: 35,
      severity: "danger",
      detail: `${product.brandName} (${product.nafdacNo}) is no longer actively registered.`,
    });
  }

  if (input.nameSimilarity !== null) {
    if (input.nameSimilarity >= NAME_MATCH_THRESHOLD) {
      signals.push({
        code: "NAME_MATCHES_REGISTRY",
        label: `Name matches the registered product (${product.brandName})`,
        weight: 0,
        severity: "good",
      });
    } else {
      signals.push({
        code: "NAME_MISMATCH",
        label: `This number is registered to ${product.brandName}, not the product named on the pack`,
        weight: 40,
        severity: "danger",
        detail: "A real number printed on a different product is a common sign of a fake.",
      });
    }
  }

  // The registry's expiry is authoritative; the printed one is checked against it.
  const registryExpiry = input.batch?.expiryDate ?? null;
  const expiry = registryExpiry ?? input.printedExpiry;
  const expired = expiry !== null && expiry < input.today;
  const expiryMismatch =
    registryExpiry !== null && input.printedExpiry !== null && monthOf(registryExpiry) !== monthOf(input.printedExpiry);
  // A known batch only reassures when nothing else about the product is wrong.
  const productConcerns = product.status !== "active" || signals.some((signal) => signal.code === "NAME_MISMATCH");

  if (!input.batchNo) {
    signals.push({
      code: "BATCH_NOT_GIVEN",
      label: "No batch number given, so recalls couldn't be checked",
      weight: 0,
      severity: "info",
    });
  } else if (!input.batch) {
    signals.push({
      code: "BATCH_UNKNOWN",
      label: `Batch ${input.batchNo} isn't in our records`,
      weight: 0,
      severity: "info",
      detail: "Our batch records are incomplete, so this alone isn't a warning.",
    });
  } else if (input.batch.recalled) {
    signals.push({
      code: "BATCH_RECALLED",
      label: `Batch ${input.batch.batchNo} has been recalled`,
      weight: 50,
      severity: "danger",
      ...(input.batch.recallNote ? { detail: input.batch.recallNote } : {}),
    });
  } else if (!expired && !expiryMismatch && !productConcerns) {
    signals.push({
      code: "BATCH_KNOWN",
      label: `Batch ${input.batch.batchNo} is a known batch of this product`,
      weight: -10,
      severity: "good",
    });
  }

  if (expired) {
    signals.push({
      code: "EXPIRED",
      label: `Expired on ${dateOnly(expiry!)}`,
      weight: 35,
      severity: "danger",
    });
  }
  if (expiryMismatch) {
    signals.push({
      code: "EXPIRY_MISMATCH",
      label: "Printed expiry doesn't match the batch record",
      weight: 30,
      severity: "danger",
      detail: `Pack says ${monthOf(input.printedExpiry!)}, records say ${monthOf(registryExpiry!)} — a sign of relabelling.`,
    });
  }

  return signals;
}
