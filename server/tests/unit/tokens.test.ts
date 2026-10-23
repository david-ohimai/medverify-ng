import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { sha256 } from "../../src/lib/hash.js";
import { accessTokenTtlSeconds, createRefreshToken, signAccessToken, verifyAccessToken } from "../../src/lib/tokens.js";

const SECRET = "test-secret-that-is-definitely-at-least-32-chars";

describe("access tokens", () => {
  it("round-trips the device id and role", () => {
    const token = signAccessToken({ sub: "device-1", role: "regulator" });
    expect(verifyAccessToken(token)).toEqual({ sub: "device-1", role: "regulator" });
  });

  it("expires after the configured TTL (15 minutes)", () => {
    expect(accessTokenTtlSeconds()).toBe(900);
  });

  it("rejects a token signed with another secret", () => {
    const forged = jwt.sign({ role: "regulator", typ: "access" }, "another-secret-that-is-also-32-chars-long", {
      subject: "device-1",
      issuer: "medverify-api",
      audience: "medverify-app",
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects an unsigned token (alg: none)", () => {
    const unsigned = jwt.sign({ role: "regulator", typ: "access", sub: "device-1" }, "", { algorithm: "none" });
    expect(() => verifyAccessToken(unsigned)).toThrow();
  });

  it("rejects a token that is not an access token", () => {
    const wrongType = jwt.sign({ role: "public", typ: "refresh" }, SECRET, {
      subject: "device-1",
      issuer: "medverify-api",
      audience: "medverify-app",
    });
    expect(() => verifyAccessToken(wrongType)).toThrow("Not an access token");
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ role: "public", typ: "access" }, SECRET, {
      subject: "device-1",
      issuer: "medverify-api",
      audience: "medverify-app",
      expiresIn: -10,
    });
    expect(() => verifyAccessToken(expired)).toThrow(jwt.TokenExpiredError);
  });
});

describe("refresh tokens", () => {
  it("returns a random token and stores only its hash", () => {
    const a = createRefreshToken();
    const b = createRefreshToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.tokenHash).toEqual(sha256(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });

  it("expires after the configured number of days", () => {
    const { expiresAt } = createRefreshToken();
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });
});
