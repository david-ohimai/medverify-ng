import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { redis } from "../lib/redis.js";
import type { ProviderName } from "./types.js";

const DAILY_LIMIT: Record<ProviderName, number> = {
  gemini: config.GEMINI_DAILY_LIMIT,
  openrouter: config.OPENROUTER_DAILY_LIMIT,
};

/** Free quotas reset on a UTC day, so the counters do too. */
const quotaKey = (provider: ProviderName, now = new Date()) => `ai:quota:${provider}:${now.toISOString().slice(0, 10)}`;

/**
 * Free-tier budget guard: one Redis counter per provider per UTC day, shared
 * by every server instance. We stop below the provider's own cap, so the
 * app degrades cleanly ("try again tomorrow" / fallback) instead of failing
 * half-way through a scan with a 429. If Redis is down the guard lets calls
 * through, the provider's own limit still applies.
 */
export const aiQuota = {
  limit: (provider: ProviderName) => DAILY_LIMIT[provider],

  /** Takes one call from today's budget; false when it is used up. */
  async reserve(provider: ProviderName): Promise<boolean> {
    try {
      const key = quotaKey(provider);
      const used = await redis.incr(key);
      if (used === 1) await redis.expire(key, 2 * 24 * 60 * 60);
      if (used > DAILY_LIMIT[provider]) {
        await redis.decr(key);
        return false;
      }
      return true;
    } catch (err) {
      logger.warn({ event: "ai:quota-unavailable", provider, message: (err as Error).message }, "Quota check skipped");
      return true;
    }
  },

  async used(provider: ProviderName): Promise<number> {
    try {
      return Number((await redis.get(quotaKey(provider))) ?? 0);
    } catch {
      return 0;
    }
  },

  async remaining(provider: ProviderName): Promise<number> {
    return Math.max(0, DAILY_LIMIT[provider] - (await this.used(provider)));
  },
};
