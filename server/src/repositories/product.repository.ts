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
   * Search by NAFDAC number prefix or (fuzzy) name. Number matches rank first,
   * then by best trigram score.
   */
  search(query: string, numberPrefix: string, limit: number) {
    const contains = `%${likeLiteral(query)}%`;
    const prefix = `${likeLiteral(numberPrefix)}%`;
    return prisma.$queryRaw<ProductSearchHit[]>`
      SELECT id, nafdac_no AS "nafdacNo", brand_name AS "brandName", generic_name AS "genericName",
             strength, dosage_form AS "dosageForm", manufacturer, status,
             GREATEST(
               similarity(brand_name, ${query}),
               similarity(generic_name, ${query}),
               word_similarity(${query}, brand_name),
               word_similarity(${query}, generic_name)
             )::float8 AS score
      FROM products
      WHERE nafdac_no LIKE ${prefix}
         OR brand_name % ${query} OR generic_name % ${query}
         OR ${query} <% brand_name OR ${query} <% generic_name
         OR brand_name ILIKE ${contains} OR generic_name ILIKE ${contains}
      ORDER BY (nafdac_no LIKE ${prefix}) DESC, score DESC, brand_name ASC
      LIMIT ${limit}`;
  },

  upsert(data: {
    nafdacNo: string;
    brandName: string;
    genericName: string;
    strength: string | null;
    dosageForm: string | null;
    manufacturer: string | null;
    status: ProductStatus;
    source: RegistrySource;
  }) {
    return prisma.product.upsert({
      where: { nafdacNo: data.nafdacNo },
      create: data,
      update: data,
      select: { id: true, nafdacNo: true },
    });
  },
};
