import type { PrismaClient } from "../generated/prisma/client.js";
import type { ProductStatus, RegistrySource } from "../generated/prisma/enums.js";

/** The transaction client Prisma passes to $transaction callbacks. */
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface ProductImportRow {
  nafdacNo: string;
  brandName: string;
  genericName: string;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  status: ProductStatus;
  source: RegistrySource;
}

export interface BatchImportRow {
  nafdacNo: string;
  batchNo: string;
  mfgDate: Date | null;
  expiryDate: Date | null;
  recalled: boolean;
  recallNote: string | null;
  source: RegistrySource;
}

/** Rows per statement: large imports become a few hundred statements, not tens of thousands of round trips. */
const CHUNK = 1000;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/**
 * Bulk writes for the registry import (`npm run seed`). Each chunk is one
 * INSERT … SELECT FROM unnest(arrays) … ON CONFLICT DO UPDATE, so a full
 * Greenbook export loads in seconds inside one transaction. All values are
 * bound parameters (Prisma tagged templates).
 */
export const registryImportRepository = {
  async upsertProducts(tx: Tx, rows: ProductImportRow[]): Promise<void> {
    for (const part of chunks(rows)) {
      await tx.$executeRaw`
        INSERT INTO products (id, nafdac_no, brand_name, generic_name, strength, dosage_form,
                              manufacturer, status, source, created_at, updated_at)
        SELECT gen_random_uuid(), u.nafdac_no, u.brand_name, u.generic_name, u.strength, u.dosage_form,
               u.manufacturer, u.status::"ProductStatus", u.source::"RegistrySource", now(), now()
        FROM unnest(
          ${part.map((r) => r.nafdacNo)}::text[],
          ${part.map((r) => r.brandName)}::text[],
          ${part.map((r) => r.genericName)}::text[],
          ${part.map((r) => r.strength)}::text[],
          ${part.map((r) => r.dosageForm)}::text[],
          ${part.map((r) => r.manufacturer)}::text[],
          ${part.map((r) => r.status)}::text[],
          ${part.map((r) => r.source)}::text[]
        ) AS u(nafdac_no, brand_name, generic_name, strength, dosage_form, manufacturer, status, source)
        ON CONFLICT (nafdac_no) DO UPDATE SET
          brand_name = EXCLUDED.brand_name,
          generic_name = EXCLUDED.generic_name,
          strength = EXCLUDED.strength,
          dosage_form = EXCLUDED.dosage_form,
          manufacturer = EXCLUDED.manufacturer,
          status = EXCLUDED.status,
          source = EXCLUDED.source,
          updated_at = now()`;
    }
  },

  /** Batches are linked to their product by NAFDAC number in the same statement. */
  async upsertBatches(tx: Tx, rows: BatchImportRow[]): Promise<void> {
    for (const part of chunks(rows)) {
      await tx.$executeRaw`
        INSERT INTO batches (id, product_id, batch_no, mfg_date, expiry_date, recalled, recall_note, source, created_at)
        SELECT gen_random_uuid(), p.id, u.batch_no, u.mfg_date::date, u.expiry_date::date,
               u.recalled, u.recall_note, u.source::"RegistrySource", now()
        FROM unnest(
          ${part.map((r) => r.nafdacNo)}::text[],
          ${part.map((r) => r.batchNo)}::text[],
          ${part.map((r) => isoDate(r.mfgDate))}::text[],
          ${part.map((r) => isoDate(r.expiryDate))}::text[],
          ${part.map((r) => r.recalled)}::boolean[],
          ${part.map((r) => r.recallNote)}::text[],
          ${part.map((r) => r.source)}::text[]
        ) AS u(nafdac_no, batch_no, mfg_date, expiry_date, recalled, recall_note, source)
        JOIN products p ON p.nafdac_no = u.nafdac_no
        ON CONFLICT (product_id, batch_no) DO UPDATE SET
          mfg_date = EXCLUDED.mfg_date,
          expiry_date = EXCLUDED.expiry_date,
          recalled = EXCLUDED.recalled,
          recall_note = EXCLUDED.recall_note,
          source = EXCLUDED.source`;
    }
  },

  /**
   * Makes the database match the CSVs: removes products and batches that are
   * no longer listed (deleted rows, or demo rows after `--no-demo`). Scans that
   * pointed at a removed product keep their history; the link becomes null.
   */
  async removeUnlisted(
    tx: Tx,
    products: ProductImportRow[],
    batches: BatchImportRow[]
  ): Promise<{ products: number; batches: number }> {
    const batchKeys = batches.map((b) => `${b.nafdacNo}/${b.batchNo}`);
    const removedBatches = await tx.$executeRaw`
      DELETE FROM batches b USING products p
      WHERE b.product_id = p.id
        AND NOT ((p.nafdac_no || '/' || b.batch_no) = ANY(${batchKeys}::text[]))`;
    const removedProducts = await tx.$executeRaw`
      DELETE FROM products WHERE NOT (nafdac_no = ANY(${products.map((p) => p.nafdacNo)}::text[]))`;
    return { products: removedProducts, batches: removedBatches };
  },
};
