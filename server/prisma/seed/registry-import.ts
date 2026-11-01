import { parse } from "csv-parse/sync";
import { z } from "zod";
import { parseExpiry } from "../../src/lib/dates.js";
import { isValidNafdacNo, normalizeBatchNo, normalizeNafdacNo } from "../../src/lib/nafdac.js";

/**
 * Parses and validates registry CSVs. Pure (text in, rows or errors out) so
 * it can be unit-tested; prisma/seed.ts does the file reading and writing.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const nafdacNo = z
  .string()
  .transform(normalizeNafdacNo)
  .refine(isValidNafdacNo, "not a valid NAFDAC number (e.g. A4-1234)");

const source = z.enum(["greenbook", "pack_label", "nafdac_alert", "demo"]);

const optionalDate = z.string().transform((value, ctx) => {
  if (value.trim() === "") return null;
  const date = parseExpiry(value.trim());
  if (!date) {
    ctx.addIssue({ code: "custom", message: `"${value}" is not a date (use YYYY-MM or YYYY-MM-DD)` });
    return z.NEVER;
  }
  return date;
});

export const productRow = z.object({
  nafdac_no: nafdacNo,
  brand_name: z.string().trim().min(1, "required").max(120),
  generic_name: z.string().trim().min(1, "required").max(200),
  strength: optionalText(80),
  dosage_form: optionalText(60),
  manufacturer: optionalText(160),
  // A blank cell arrives as "", not undefined, treat it as "use the default".
  status: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(["active", "expired", "cancelled"]).default("active")
  ),
  source,
});
export type ProductRow = z.infer<typeof productRow>;

export const batchRow = z.object({
  nafdac_no: nafdacNo,
  batch_no: z
    .string()
    .transform(normalizeBatchNo)
    .refine((value) => value.length >= 2 && value.length <= 40, "must be 2-40 characters"),
  mfg_date: optionalDate,
  expiry_date: optionalDate,
  recalled: z
    .enum(["true", "false", ""])
    .transform((value) => value === "true"),
  recall_note: optionalText(500),
  source,
});
export type BatchRow = z.infer<typeof batchRow>;

export interface ParseResult<T> {
  rows: T[];
  errors: string[];
}

/** Parses one CSV file; every invalid row is reported as "file:line field: message". */
export function parseCsv<T>(fileName: string, text: string, schema: z.ZodType<T>): ParseResult<T> {
  const records = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    // Whole lines starting with # are comments; a # inside a value ("Recall #42",
    // "Lab #2 Ltd") is data, not the start of a comment.
    comment: "#",
    comment_no_infix: true,
    info: true,
  }) as Array<{ record: Record<string, string>; info: { lines: number } }>;

  const rows: T[] = [];
  const errors: string[] = [];
  for (const { record, info } of records) {
    const result = schema.safeParse(record);
    if (result.success) {
      rows.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        errors.push(`${fileName}:${info.lines} ${issue.path.join(".") || "row"}: ${issue.message}`);
      }
    }
  }
  return { rows, errors };
}

/** Cross-file checks: duplicates, and batches pointing at products that don't exist. */
export function checkConsistency(products: ProductRow[], batches: BatchRow[]): string[] {
  const errors: string[] = [];
  const known = new Set<string>();
  for (const product of products) {
    if (known.has(product.nafdac_no)) errors.push(`duplicate product ${product.nafdac_no}`);
    known.add(product.nafdac_no);
  }

  const seenBatches = new Set<string>();
  for (const batch of batches) {
    if (!known.has(batch.nafdac_no)) {
      errors.push(`batch ${batch.batch_no} refers to unknown product ${batch.nafdac_no}`);
    }
    const key = `${batch.nafdac_no}/${batch.batch_no}`;
    if (seenBatches.has(key)) errors.push(`duplicate batch ${key}`);
    seenBatches.add(key);
  }
  return errors;
}
