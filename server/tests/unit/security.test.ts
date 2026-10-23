import { describe, expect, it } from "vitest";
import { secureEquals, sha256 } from "../../src/lib/hash.js";
import { scrubSensitive } from "../../src/lib/scrub.js";

describe("secureEquals", () => {
  it("matches equal strings and rejects different ones, whatever the length", () => {
    expect(secureEquals("246810", "246810")).toBe(true);
    expect(secureEquals("246811", "246810")).toBe(false);
    expect(secureEquals("2468", "246810")).toBe(false);
    expect(secureEquals("", "246810")).toBe(false);
  });
});

describe("sha256", () => {
  it("is deterministic and 64 hex characters", () => {
    expect(sha256("install-id")).toEqual(sha256("install-id"));
    expect(sha256("install-id")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("scrubSensitive", () => {
  it("removes bearer tokens, JWTs, connection strings and secrets", () => {
    const jwtLike = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123_-";
    const text = [
      "Authorization: Bearer abc.def.ghi",
      `token in body ${jwtLike}`,
      "connect postgresql://medverify:medverify@localhost:5432/medverify failed",
      "redis://default:secret@host:6379",
      'password="hunter2" pin=246810',
    ].join(" | ");

    const scrubbed = scrubSensitive(text);

    expect(scrubbed).not.toContain("abc.def.ghi");
    expect(scrubbed).not.toContain(jwtLike);
    expect(scrubbed).not.toContain("medverify:medverify@");
    expect(scrubbed).not.toContain("secret@host");
    expect(scrubbed).not.toContain("hunter2");
    expect(scrubbed).not.toContain("246810");
  });
});
