import CircuitBreaker from "opossum";
import { logger } from "../lib/logger.js";
import { LlmError } from "./types.js";

export interface RetryOptions {
  /** Total tries, including the first. */
  attempts: number;
  baseDelayMs: number;
  /** Never wait longer than this between tries; a longer Retry-After means "give up and fall back". */
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries a provider call when the failure is retryable. The provider's own
 * Retry-After always wins over exponential backoff; when it asks for longer
 * than maxDelayMs we stop here so the next provider can take over at once.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof LlmError && err.retryable;
      if (!retryable || attempt >= options.attempts) throw err;

      const backoff = options.baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      const delay = err.retryAfterMs ?? backoff;
      if (delay > options.maxDelayMs) throw err;

      logger.warn(
        { event: "llm:retry", provider: err.provider, code: err.code, attempt, delayMs: delay },
        "LLM call failed; retrying"
      );
      await sleep(delay);
    }
  }
}

/**
 * One circuit breaker per provider. After repeated failures the circuit
 * opens and calls fail instantly for `resetTimeout`, so a dead provider
 * costs nothing and the fallback answers straight away. Only failures that
 * mean "the provider is unwell" count — a bad request or an invalid answer
 * is our problem, not the provider's.
 */
export function createBreaker(name: string) {
  const breaker = new CircuitBreaker(<T>(fn: () => Promise<T>) => fn(), {
    name,
    timeout: false, // each provider call already has its own timeout
    errorThresholdPercentage: 50,
    volumeThreshold: 3,
    rollingCountTimeout: 60_000,
    resetTimeout: 30_000,
    errorFilter: (err: unknown) => !(err instanceof LlmError && err.retryable),
  });

  breaker.on("open", () => logger.warn({ event: "llm:circuit-open", provider: name }, "Circuit opened"));
  breaker.on("halfOpen", () => logger.info({ event: "llm:circuit-half-open", provider: name }, "Circuit half-open"));
  breaker.on("close", () => logger.info({ event: "llm:circuit-closed", provider: name }, "Circuit closed"));

  return {
    fire: <T>(fn: () => Promise<T>) => breaker.fire(fn) as Promise<T>,
    get isOpen() {
      return breaker.opened;
    },
    shutdown: () => breaker.shutdown(),
  };
}

export type Breaker = ReturnType<typeof createBreaker>;
