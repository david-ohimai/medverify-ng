import { beforeEach, describe, expect, it, vi } from "vitest";
import { llmService } from "../../src/ai/llm.service.js";
import { cacheGetJson, cacheSetJson } from "../../src/lib/cache.js";
import { scanService } from "../../src/services/scan.service.js";
import { speechService, spokenEnglish } from "../../src/services/speech.service.js";
import type { VerificationResult } from "../../src/services/verification.service.js";

vi.mock("../../src/services/scan.service.js", () => ({ scanService: { getForDevice: vi.fn() } }));
vi.mock("../../src/ai/llm.service.js", () => ({ llmService: { run: vi.fn() } }));
vi.mock("../../src/ai/prompts.js", () => ({ getActivePrompt: vi.fn().mockResolvedValue({ version: 1, system: "", source: "database" }) }));
vi.mock("../../src/lib/cache.js", async (original) => ({
  ...(await original<typeof import("../../src/lib/cache.js")>()),
  cacheGetJson: vi.fn(),
  cacheSetJson: vi.fn(),
}));

const result = {
  scanId: "s-1",
  headline: "High risk, do not take it",
  advice: "Don't take this medicine. Show it to a pharmacist or report it to NAFDAC.",
  signals: [
    { code: "NAME_MATCHES_REGISTRY", label: "Name matches", weight: 0, severity: "good" },
    { code: "EXPIRED", label: "Expired on 2025-02-28", weight: 35, severity: "danger" },
    { code: "BATCH_RECALLED", label: "Batch DQ2310 has been recalled", weight: 50, severity: "danger" },
  ],
  review: null,
} as unknown as VerificationResult;

beforeEach(() => {
  vi.mocked(scanService.getForDevice).mockResolvedValue(result);
  vi.mocked(cacheGetJson).mockResolvedValue(undefined);
});

describe("spokenEnglish", () => {
  it("headline, the heaviest warning, then the advice", () => {
    expect(spokenEnglish(result)).toBe(
      "High risk, do not take it. Batch DQ2310 has been recalled. Don't take this medicine. Show it to a pharmacist or report it to NAFDAC."
    );
  });
});

describe("speechService.forScan", () => {
  it("English needs no AI", async () => {
    const speech = await speechService.forScan("d-1", "s-1", "en");
    expect(speech).toMatchObject({ language: "en", ttsLocale: "en-NG", translatedBy: "builtin" });
    expect(llmService.run).not.toHaveBeenCalled();
  });

  it("Pidgin is translated once, cached, and read by an English voice", async () => {
    vi.mocked(llmService.run).mockResolvedValue({ data: { text: "No use dis medicine." }, provider: "gemini" } as never);
    const speech = await speechService.forScan("d-1", "s-1", "pcm");
    expect(speech).toMatchObject({ text: "No use dis medicine.", ttsLocale: "en-NG", translatedBy: "gemini" });
    expect(vi.mocked(llmService.run).mock.calls[0]![1][0]).toMatchObject({ text: expect.stringContaining("Target language: Nigerian Pidgin") });
    expect(cacheSetJson).toHaveBeenCalled();
  });

  it("a cached translation costs no AI call", async () => {
    vi.mocked(cacheGetJson).mockResolvedValue({ text: "Kada a sha wannan magani." });
    const speech = await speechService.forScan("d-1", "s-1", "ha");
    expect(speech).toMatchObject({ text: "Kada a sha wannan magani.", ttsLocale: "ha-NG", translatedBy: "cache" });
    expect(llmService.run).not.toHaveBeenCalled();
  });
});
