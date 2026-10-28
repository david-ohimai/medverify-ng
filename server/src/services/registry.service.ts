import { CACHE_TTL, cacheGetJson, cacheKeys, cacheSetJson } from "../lib/cache.js";
import { NotFoundError } from "../lib/errors.js";
import { normalizeNafdacNo } from "../lib/nafdac.js";
import { productRepository } from "../repositories/product.repository.js";

export type RegistryProduct = NonNullable<Awaited<ReturnType<typeof productRepository.findByNafdacNo>>>;

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

  /** A product and its known batches — for the product detail endpoint. */
  async getProductWithBatches(rawNafdacNo: string) {
    const product = await productRepository.findWithBatches(normalizeNafdacNo(rawNafdacNo));
    if (!product) throw new NotFoundError("No product is registered under that NAFDAC number");
    return product;
  },

  /**
   * Search by number or name. Something that looks like the start of a NAFDAC
   * number ("A4-12") is also matched as a number prefix.
   */
  search(query: string, limit: number) {
    return productRepository.search(query, normalizeNafdacNo(query), limit);
  },
};
