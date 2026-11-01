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

/**
 * Deletes every key matching a pattern, using SCAN (never KEYS, which blocks
 * Redis while it walks every key). ioredis adds its keyPrefix to commands but
 * NOT to SCAN patterns or the keys SCAN returns, so the prefix is added to the
 * pattern here and stripped before DEL re-adds it.
 */
export async function cacheDelPattern(pattern: string): Promise<number> {
  const prefix = redis.options.keyPrefix ?? "";
  let cursor = "0";
  let deleted = 0;
  try {
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}${pattern}`, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) {
        deleted += await redis.del(...keys.map((key) => key.slice(prefix.length)));
      }
    } while (cursor !== "0");
  } catch (err) {
    logger.warn({ event: "cache:delete-pattern-failed", pattern, message: (err as Error).message }, "Cache pattern delete failed");
  }
  return deleted;
}

export const CACHE_TTL = {
  /** Short: role and token version must take effect quickly even if a delete is missed. */
  deviceAuthState: 60,
  /** The registry only changes when it is re-seeded, which clears these keys. */
  registryProduct: 10 * 60,
  /** Unknown numbers are cached briefly so repeated probing doesn't hit the database. */
  registryMiss: 60,
  /** Activating a prompt through the API clears it at once; edits made elsewhere apply within 5 minutes. */
  activePrompt: 5 * 60,
  /** Same photo (+ same references) + same prompt version = same AI answer, so rescans cost no quota. */
  aiResult: 7 * 24 * 60 * 60,
} as const;

export const cacheKeys = {
  deviceAuthState: (deviceId: string) => `device-auth:${deviceId}`,
  registryProduct: (nafdacNo: string) => `registry:product:${nafdacNo}`,
  registryAll: "registry:*",
  activePrompt: (task: string) => `ai:prompt:${task}`,
  labelRead: (imageHash: string, promptVersion: number) => `ai:label:${imageHash}:v${promptVersion}`,
  translation: (textHash: string, language: string, promptVersion: number) => `ai:translation:${textHash}:${language}:v${promptVersion}`,
  packCompare: (imageHash: string, referencesKey: string, promptVersion: number) =>
    `ai:compare:${imageHash}:${referencesKey}:v${promptVersion}`,
} as const;
