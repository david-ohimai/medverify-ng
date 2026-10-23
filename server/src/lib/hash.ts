import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Constant-time comparison. Both sides are hashed first so the comparison
 * takes the same time whatever the inputs' lengths — no timing side channel.
 */
export function secureEquals(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/** URL-safe random string with `bytes` bytes of entropy. */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}
