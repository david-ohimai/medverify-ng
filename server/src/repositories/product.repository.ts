import { prisma } from "../lib/prisma.js";
import type { ProductStatus, RegistrySource } from "../generated/prisma/enums.js";

export const productSelect = {
  id: true,
  nafdacNo: true,
  brandName: true,
  genericName: true,
  strength: true,
  dosageForm: true,
  manufacturer: true,
  status: true,
  // Always returned, so a fictional demo row can never pass as real NAFDAC data.
  source: true,
} as const;

export interface ProductSearchHit {
  id: string;
  nafdacNo: string;
  brandName: string;
  genericName: string;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  status: ProductStatus;
  source: RegistrySource;
  score: number;
}

/** Escapes LIKE wildcards so user input is matched literally. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Data access for the registry. Fuzzy matching uses pg_trgm (GIN-indexed):
 * similarity() for whole strings, word_similarity() for a name inside a longer
 * one ("Coartem" inside "Coartem 80/480 Dispersible"). All raw SQL goes
 * through $queryRaw tagged templates, which Prisma parameterises.
 * Bulk writes for the seed live in registryImport.repository.ts.
 */
export const productRepository = {
  findByNafdacNo(nafdacNo: string) {
    return prisma.product.findUnique({ where: { nafdacNo }, select: productSelect });
  },

  findWithBatches(nafdacNo: string) {
    return prisma.product.findUnique({
      where: { nafdacNo },
      select: {
        ...productSelect,
        batches: {
          select: { batchNo: true, expiryDate: true, recalled: true, recallNote: true },
          orderBy: { expiryDate: "desc" },
        },
        // Metadata only; the photo itself is served by its own endpoint.
        referenceImages: {
          select: { id: true, side: true, width: true, height: true },
          orderBy: [{ side: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  },

  findBatch(productId: string, batchNo: string) {
    return prisma.batch.findUnique({
      where: { productId_batchNo: { productId, batchNo } },
      select: { batchNo: true, expiryDate: true, recalled: true, recallNote: true },
    });
  },

  /** 0–1: how well `name` matches the product's brand or generic name. */
  async nameSimilarity(productId: string, name: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ score: number }>>`
      SELECT GREATEST(
        similarity(lower(brand_name), lower(${name})),
        similarity(lower(generic_name), lower(${name})),
        word_similarity(lower(brand_name), lower(${name})),
        word_similarity(lower(${name}), lower(brand_name)),
        word_similarity(lower(${name}), lower(generic_name))
      )::float8 AS score
      FROM products WHERE id = ${productId}::uuid`;
    return rows[0]?.score ?? 0;
  },

  /**
   * Search by (fuzzy) name, and by NAFDAC number prefix when the query looks
   * like the start of one. Number matches rank first, then by trigram score.
   * `numberPrefix` is null for plain words, so "nafdac" never matches every
   * number as an empty prefix.
   */
  search(query: string, numberPrefix: string | null, limit: number) {
    const contains = `%${likeLiteral(query)}%`;
    const prefix = numberPrefix === null ? null : `${likeLiteral(numberPrefix)}%`;
    return prisma.$queryRaw<ProductSearchHit[]>`
      SELECT id, nafdac_no AS "nafdacNo", brand_name AS "brandName", generic_name AS "genericName",
             strength, dosage_form AS "dosageForm", manufacturer, status, source,
             GREATEST(
               similarity(brand_name, ${query}),
               similarity(generic_name, ${query}),
               word_similarity(${query}, brand_name),
               word_similarity(${query}, generic_name)
             )::float8 AS score
      FROM products
      WHERE (${prefix}::text IS NOT NULL AND nafdac_no LIKE ${prefix}::text)
         OR brand_name % ${query} OR generic_name % ${query}
         OR ${query} <% brand_name OR ${query} <% generic_name
         OR brand_name ILIKE ${contains} OR generic_name ILIKE ${contains}
      ORDER BY (${prefix}::text IS NOT NULL AND nafdac_no LIKE ${prefix}::text) DESC, score DESC, brand_name ASC
      LIMIT ${limit}`;
  },
};
