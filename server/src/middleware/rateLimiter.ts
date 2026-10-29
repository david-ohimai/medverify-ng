import type { Request } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { config } from "../lib/config.js";
import { rateLimitedTotal } from "../lib/metrics.js";
import { redis } from "../lib/redis.js";
import { errorBody } from "../lib/response.js";
import type { DeviceRole } from "../generated/prisma/enums.js";

/**
 * - "ip": before authentication.
 * - "device": after it, so limits follow the device across networks.
 * - "global": one shared counter for everyone — for secrets that can be
 *   guessed, where minting new devices or IPs must not buy more attempts.
 */
type KeyBy = "ip" | "device" | "global";

interface LimiterOptions {
  /** Unique name — becomes the Redis key prefix and the metrics label. */
  name: string;
  windowMs: number;
  /** A fixed limit, or one per role (regulators get more). */
  limit: number | Record<DeviceRole, number>;
  message: string;
  keyBy: KeyBy;
  /** Count only failed requests (4xx/5xx). Used for the PIN, where only wrong guesses matter. */
  failuresOnly?: boolean;
}

function keyFor(req: Request, keyBy: KeyBy): string {
  if (keyBy === "global") return "all";
  if (keyBy === "device" && req.device) return `device:${req.device.id}`;
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

/**
 * Builds a sliding-window limiter backed by Redis, so every server instance
 * shares one counter. Sends standard RateLimit-* headers and Retry-After.
 * Tests use the in-memory store so they don't need Redis.
 */
export function createLimiter(options: LimiterOptions) {
  const store: Options["store"] | undefined = config.isTest
    ? undefined
    : new RedisStore({
        prefix: `rl:${options.name}:`,
        sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
      });

  return rateLimit({
    windowMs: options.windowMs,
    limit: (req) => {
      if (typeof options.limit === "number") return options.limit;
      return options.limit[req.device?.role ?? "public"];
    },
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => keyFor(req, options.keyBy),
    skipSuccessfulRequests: options.failuresOnly ?? false,
    ...(store ? { store } : {}),
    handler: (_req, res) => {
      rateLimitedTotal.inc({ limiter: options.name });
      res.status(429).json(errorBody(429, "RATE_LIMITED", options.message));
    },
  });
}

/** Device registration: per IP — stops one client minting thousands of devices. */
export const registerLimiter = createLimiter({
  name: "register",
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: "Too many registrations from this network. Please try again later.",
  keyBy: "ip",
});

/** Token refresh: per IP. */
export const refreshLimiter = createLimiter({
  name: "refresh",
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many token refreshes. Please try again later.",
  keyBy: "ip",
});

/** General API: per device, by role. Stacks with the endpoint limiters below. */
export const apiLimiter = createLimiter({
  name: "api",
  windowMs: 15 * 60 * 1000,
  limit: { public: 300, regulator: 1000 },
  message: "Rate limit exceeded. Please slow down.",
  keyBy: "device",
});

/** Verifications: per device. Each one is a DB write, and probing numbers in bulk is abuse. */
export const verifyLimiter = createLimiter({
  name: "verify",
  windowMs: 60 * 1000,
  limit: { public: 20, regulator: 60 },
  message: "Too many checks in a minute. Please slow down.",
  keyBy: "device",
});

/**
 * Photo scans: per device, per minute and per day. Each scan is an AI call
 * on a free tier, so these limits also protect the shared daily quota.
 */
export const scanUploadLimiter = createLimiter({
  name: "scan-upload",
  windowMs: 60 * 1000,
  limit: { public: 10, regulator: 30 },
  message: "Too many photo scans in a minute. Please wait a moment.",
  keyBy: "device",
});

export const scanDailyLimiter = createLimiter({
  name: "scan-daily",
  windowMs: 24 * 60 * 60 * 1000,
  limit: { public: 60, regulator: 200 },
  message: "Daily photo scan limit reached. You can still type the NAFDAC number in.",
  keyBy: "device",
});

/** Registry search: per device. Generous for type-ahead, but stops scraping the registry. */
export const searchLimiter = createLimiter({
  name: "search",
  windowMs: 60 * 1000,
  limit: { public: 60, regulator: 120 },
  message: "Too many searches in a minute. Please slow down.",
  keyBy: "device",
});

/**
 * Regulator PIN — three stacked limits on WRONG guesses, because a new device
 * id costs an attacker nothing:
 *   per device  5 / 15 min   (normal typos)
 *   per IP     10 / hour     (minting devices from one network doesn't help)
 *   global     30 / 15 min   (a botnet of IPs doesn't help either)
 * The global cap bounds an attacker to ~2,900 guesses a day; against a
 * 6-digit PIN that is ~0.3% a day, and every miss is logged and counted in
 * security_events_total. Use 8+ digits for anything beyond the demo.
 */
export const pinDeviceLimiter = createLimiter({
  name: "pin-device",
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many PIN attempts. Please try again in 15 minutes.",
  keyBy: "device",
  failuresOnly: true,
});

export const pinIpLimiter = createLimiter({
  name: "pin-ip",
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many PIN attempts from this network. Please try again later.",
  keyBy: "ip",
  failuresOnly: true,
});

export const pinGlobalLimiter = createLimiter({
  name: "pin-global",
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Regulator sign-in is temporarily locked. Please try again in 15 minutes.",
  keyBy: "global",
  failuresOnly: true,
});

export const pinLimiters = [pinGlobalLimiter, pinIpLimiter, pinDeviceLimiter];
