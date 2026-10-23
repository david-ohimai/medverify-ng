import { Redis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Shared Redis connection for rate limits and cache. BullMQ gets its own
 * connections later (it needs maxRetriesPerRequest: null and blocking calls).
 *
 * lazyConnect: nothing connects at import time, so tests can import the app
 * without a Redis server. server.ts connects explicitly at startup.
 */
export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  keyPrefix: "medverify:",
  maxRetriesPerRequest: 2,
  enableOfflineQueue: true,
});

redis.on("error", (err: NodeJS.ErrnoException) => {
  // Connection-refused errors on dual-stack hosts have an empty message; the code says it all.
  logger.error({ event: "redis:error", message: err.message || err.code || err.name }, "Redis connection error");
});

redis.on("ready", () => {
  logger.info({ event: "redis:ready" }, "Redis connected");
});
