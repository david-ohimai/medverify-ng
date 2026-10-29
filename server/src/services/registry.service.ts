import { CACHE_TTL, cacheGetJson, cacheKeys, cacheSetJson } from "../lib/cache.js";
import { NotFoundError } from "../lib/errors.js";
import { normalizeNafdacNo } from "../lib/nafdac.js";
import { productRepository } from "../repositories/product.repository.js";
import { referenceImageRepository } from "../repositories/referenceImage.repository.js";

export type RegistryProduct = NonNullable<Awaited<ReturnType<typeof productRepository.findByNafdacNo>>>;

/**
 * Something that could be the start of a NAFDAC number: begins with an
 * optional letter then a digit ("A4", "A4-12", "04-5"). Plain words like
 * "coartem" or "nafdac" are name searches only.
 */
const NUMBER_PREFIX = /^[A-Z]?\d[A-Z0-9-]*$/;

/**
 * Read side of the NAFDAC registry. Lookups by number are cache-aside in
 * Redis (10 min; misses 60 s); re-seeding the registry clears the cache.
 */
export const registryService = {
  async findProduct(nafdacNo: string): Promise<RegistryProduct | null> {
    const key = cacheKeys.registryProduct(nafdacNo);
    const cached = await cacheGetJson<RegistryProduct | { missing: true }>(key);
    if (cached) return "missing" in cached ? null : cached;

    const product = await productRepository.findByNafdacNo(nafdacNo);
    await cacheSetJson(
      key,
      product ?? { missing: true },
      product ? CACHE_TTL.registryProduct : CACHE_TTL.registryMiss
    );
    return product;
  },

  /** A product and its known batches. `nafdacNo` is already normalised by the validator. */
  async getProductWithBatches(nafdacNo: string) {
    const product = await productRepository.findWithBatches(nafdacNo);
    if (!product) throw new NotFoundError("No product is registered under that NAFDAC number");
    return product;
  },

  /** A genuine-pack photo of a product (JPEG bytes), e.g. to show beside the user's scan. */
  async getReferenceImage(nafdacNo: string, imageId: string) {
    const image = await referenceImageRepository.findImage(imageId, nafdacNo);
    if (!image) throw new NotFoundError("Reference image not found");
    return { data: Buffer.from(image.data), etag: `"${image.sha256.slice(0, 32)}"` };
  },

  /** Search by name, and by number prefix when the query looks like one. */
  search(query: string, limit: number) {
    const normalized = normalizeNafdacNo(query);
    const numberPrefix = normalized.length >= 2 && NUMBER_PREFIX.test(normalized) ? normalized : null;
    return productRepository.search(query, numberPrefix, limit);
  },
};
