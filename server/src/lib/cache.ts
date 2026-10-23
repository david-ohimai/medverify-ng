import { logger } from "./logger.js";
import { redis } from "./redis.js";

/**
 * Cache-aside helpers over Redis (keys get the "medverify:" prefix from the
 * client). The cache is an optimisation, never a dependency: if Redis is
 * down every read is a miss and every write is skipped, so the caller falls
 * back to the database.
 */
export async function cacheGetJson<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch (err) {
    logger.warn({ event: "cache:read-failed", key, message: (err as Error).message }, "Cache read failed");
    return undefined;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ event: "cache:write-failed", key, message: (err as Error).message }, "Cache write failed");
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn({ event: "cache:delete-failed", key, message: (err as Error).message }, "Cache delete failed");
  }
}

export const CACHE_TTL = {
  /** Short: role and token version must take effect quickly even if a delete is missed. */
  deviceAuthState: 60,
} as const;

export const cacheKeys = {
  deviceAuthState: (deviceId: string) => `device-auth:${deviceId}`,
} as const;
