import { z } from "zod";
import { parseExpiry } from "../lib/dates.js";
import { isValidNafdacNo, normalizeBatchNo, normalizeNafdacNo } from "../lib/nafdac.js";

/**
 * Field rules shared by every endpoint, so a NAFDAC number, batch or expiry
 * is validated the same way everywhere.
 */

/** Any printed form of a NAFDAC number, normalised to "A4-1234"; rejected if it can't be one. */
export const nafdacNoField = z
  .string()
  .max(60)
  .transform(normalizeNafdacNo)
  .refine(isValidNafdacNo, "Not a valid NAFDAC number (expected something like A4-1234)");

export const batchNoField = z
  .string()
  .max(60)
  .transform(normalizeBatchNo)
  .refine((value) => value.length >= 2 && value.length <= 40, "Batch number must be 2-40 characters");

/** "YYYY-MM" as printed on packs, or a full "YYYY-MM-DD". */
export const expiryField = z.string().transform((value, ctx) => {
  const date = parseExpiry(value.trim());
  if (!date) {
    ctx.addIssue({ code: "custom", message: "Expiry must look like 2027-08 or 2027-08-31" });
    return z.NEVER;
  }
  return date;
});
