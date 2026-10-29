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

/**
 * Optional scan location. Both or neither; numbers or numeric strings
 * (multipart form fields arrive as strings). Rounded to ~1 km later.
 */
export const locationFields = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
};

export function bothOrNeither(value: { lat?: number | undefined; lng?: number | undefined }): boolean {
  return (value.lat === undefined) === (value.lng === undefined);
}
export const bothOrNeitherMessage = { message: "Send lat and lng together, or neither", path: ["lat"] };

/** "YYYY-MM" as printed on packs, or a full "YYYY-MM-DD". */
export const expiryField = z.string().transform((value, ctx) => {
  const date = parseExpiry(value.trim());
  if (!date) {
    ctx.addIssue({ code: "custom", message: "Expiry must look like 2027-08 or 2027-08-31" });
    return z.NEVER;
  }
  return date;
});
