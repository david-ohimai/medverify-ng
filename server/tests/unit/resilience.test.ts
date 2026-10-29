import { describe, expect, it, vi } from "vitest";
import { geminiRetryAfterMs } from "../../src/ai/providers/gemini.provider.js";
import { withRetry } from "../../src/ai/resilience.js";
import { LlmError } from "../../src/ai/types.js";

const retryable = (retryAfterMs?: number) => new LlmError("busy", "gemini", "RATE_LIMITED", true, 429, retryAfterMs);

describe("withRetry", () => {
  it("honours the provider's Retry-After over its own backoff", async () => {
    const sleep = vi.fn(async () => undefined);
    const fn = vi.fn().mockRejectedValueOnce(retryable(1_500)).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 10, maxDelayMs: 5_000, sleep })).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledWith(1_500);
  });

  it("gives up straight away when the wait is longer than maxDelayMs (so the fallback can answer)", async () => {
    const sleep = vi.fn(async () => undefined);
    const fn = vi.fn().mockRejectedValue(retryable(60_000));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 10, maxDelayMs: 5_000, sleep })).rejects.toBeInstanceOf(LlmError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("never retries a non-retryable error, and stops after the last attempt", async () => {
    const fatal = vi.fn().mockRejectedValue(new LlmError("bad key", "gemini", "AUTH_FAILED", false, 403));
    await expect(withRetry(fatal, { attempts: 3, baseDelayMs: 1, maxDelayMs: 50, sleep: async () => undefined })).rejects.toThrow();
    expect(fatal).toHaveBeenCalledTimes(1);

    const busy = vi.fn().mockRejectedValue(retryable());
    await expect(withRetry(busy, { attempts: 3, baseDelayMs: 1, maxDelayMs: 50_000, sleep: async () => undefined })).rejects.toThrow();
    expect(busy).toHaveBeenCalledTimes(3);
  });
});

describe("geminiRetryAfterMs", () => {
  it.each([
    ['{"error":{"details":[{"retryDelay":"31s"}]}}', 31_000],
    ["Quota exceeded. Please retry in 12.5s.", 12_500],
    ["Internal error", undefined],
  ])("%s → %s", (message, expected) => {
    expect(geminiRetryAfterMs(message)).toBe(expected);
  });
});
