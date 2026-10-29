import { describe, expect, it, vi } from "vitest";
import { createLlmService } from "../../src/ai/llm.service.js";
import type { LabelRead } from "../../src/ai/tasks.js";
import { LlmError, type GenerateJsonRequest, type LlmProvider, type ProviderName } from "../../src/ai/types.js";
import { AiQuotaExhaustedError, AiUnavailableError } from "../../src/lib/errors.js";
import { appEvents } from "../../src/lib/events.js";

const field = (value: string | null, confidence = 0.95) => ({ value, confidence });
const LABEL: LabelRead = {
  is_medicine_pack: true,
  image_quality: "good",
  brand_name: field("Demoquine"),
  generic_name: field("Artemether/Lumefantrine"),
  strength: field("80/480 mg"),
  nafdac_no: field("X9-0001"),
  batch_no: field("DQ2401"),
  mfg_date: field("2024-08"),
  expiry_date: field("2027-08"),
  manufacturer: field(null, 0),
  text_anomalies: [],
};

type Reply = string | LlmError;

/** A provider that answers from a script, one reply per call. */
function scripted(name: ProviderName, replies: Reply[]) {
  const calls: GenerateJsonRequest[] = [];
  const provider: LlmProvider = {
    name,
    modelFor: () => `${name}-model`,
    async generateJson(request) {
      calls.push(request);
      const reply = replies.shift();
      if (reply === undefined) throw new Error(`${name}: no scripted reply left`);
      if (reply instanceof LlmError) throw reply;
      return { text: reply, model: `${name}-model`, usage: { inputTokens: 100, outputTokens: 20 } };
    },
    chat: async () => {
      throw new Error("not used in these tests");
    },
  };
  return { provider, calls };
}

function quota(budget: Partial<Record<ProviderName, number>> = {}) {
  const left = { gemini: 100, openrouter: 100, ...budget };
  return {
    reserve: vi.fn(async (name: ProviderName) => (left[name]-- > 0 ? true : false)),
    used: vi.fn(async () => 0),
    remaining: vi.fn(async (name: ProviderName) => Math.max(0, left[name])),
    limit: () => 100,
  };
}

function service(providers: LlmProvider[], quotaStub = quota()) {
  return createLlmService({
    providers,
    quota: quotaStub,
    getPrompt: async () => ({ version: 3, system: "Read the label." }),
    retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 50, sleep: async () => undefined },
    timeoutMs: 50,
  });
}

const rateLimited = (name: ProviderName, retryAfterMs?: number) =>
  new LlmError("429", name, "RATE_LIMITED", true, 429, retryAfterMs);
const image = [{ type: "image" as const, mimeType: "image/jpeg", data: Buffer.from("x") }];
const ctx = { inputSummary: "pack photo", scanId: "scan-1" };

describe("llmService.run", () => {
  it("returns validated output from the primary, with the prompt version and usage, and audits the call", async () => {
    const gemini = scripted("gemini", [JSON.stringify(LABEL)]);
    const audit = vi.fn();
    appEvents.on("ai:called", audit);

    const result = await service([gemini.provider]).run("read_label", image, ctx);

    appEvents.off("ai:called", audit);
    expect(result).toMatchObject({ provider: "gemini", promptVersion: 3, fallbackUsed: false, data: LABEL });
    expect(gemini.calls[0]).toMatchObject({ system: "Read the label.", tier: "vision" });
    // The schema sent to the provider is plain JSON Schema built from the Zod schema.
    expect(gemini.calls[0]!.jsonSchema).toMatchObject({ type: "object" });
    expect(gemini.calls[0]!.jsonSchema).not.toHaveProperty("$schema");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ task: "read_label", provider: "gemini", success: true, promptVersion: 3, scanId: "scan-1", inputTokens: 100 })
    );
  });

  it("retries a rate-limited call on the same provider before falling back", async () => {
    const gemini = scripted("gemini", [rateLimited("gemini", 10), JSON.stringify(LABEL)]);
    const result = await service([gemini.provider]).run("read_label", image, ctx);
    expect(result.provider).toBe("gemini");
    expect(gemini.calls).toHaveLength(2);
  });

  it("falls back to the next provider when the primary keeps failing — and says so", async () => {
    const gemini = scripted("gemini", [rateLimited("gemini"), rateLimited("gemini")]);
    const openrouter = scripted("openrouter", [JSON.stringify(LABEL)]);
    const audit = vi.fn();
    appEvents.on("ai:called", audit);

    const result = await service([gemini.provider, openrouter.provider]).run("read_label", image, ctx);

    appEvents.off("ai:called", audit);
    expect(result).toMatchObject({ provider: "openrouter", fallbackUsed: true });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini", success: false, errorCode: "RATE_LIMITED" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ provider: "openrouter", success: true, fallbackUsed: true }));
  });

  it("doesn't wait out a long Retry-After: it falls back at once", async () => {
    const gemini = scripted("gemini", [rateLimited("gemini", 60_000)]);
    const openrouter = scripted("openrouter", [JSON.stringify(LABEL)]);
    const result = await service([gemini.provider, openrouter.provider]).run("read_label", image, ctx);
    expect(gemini.calls).toHaveLength(1);
    expect(result.provider).toBe("openrouter");
  });

  it("cuts off a provider that hangs (hard per-attempt deadline) and falls back", async () => {
    const hanging: LlmProvider = {
      name: "gemini",
      modelFor: () => "slow-model",
      generateJson: (request) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener("abort", () =>
            reject(new LlmError("timed out", "gemini", "TIMEOUT", true))
          );
        }),
      chat: async () => {
        throw new Error("not used");
      },
    };
    const openrouter = scripted("openrouter", [JSON.stringify(LABEL)]);
    const result = await service([hanging, openrouter.provider]).run("read_label", image, ctx);
    expect(result).toMatchObject({ provider: "openrouter", fallbackUsed: true });
  });

  it("asks once for a corrected reply when the JSON doesn't match the schema", async () => {
    const gemini = scripted("gemini", [JSON.stringify({ is_medicine_pack: "yes" }), "```json\n" + JSON.stringify(LABEL) + "\n```"]);
    const result = await service([gemini.provider]).run("read_label", image, ctx);
    expect(result.data).toEqual(LABEL);
    const repair = gemini.calls[1]!.parts.at(-1);
    expect(repair).toMatchObject({ type: "text", text: expect.stringContaining("did not match the required JSON schema") });
  });

  it("gives up on a provider that is still invalid after the repair round", async () => {
    const gemini = scripted("gemini", ["not json", "{}"]);
    const openrouter = scripted("openrouter", [JSON.stringify(LABEL)]);
    const result = await service([gemini.provider, openrouter.provider]).run("read_label", image, ctx);
    expect(result.provider).toBe("openrouter");
  });

  it("skips a provider whose daily budget is spent, and reports quota exhaustion when all are", async () => {
    const gemini = scripted("gemini", []);
    const openrouter = scripted("openrouter", [JSON.stringify(LABEL)]);
    const result = await service([gemini.provider, openrouter.provider], quota({ gemini: 0 })).run("read_label", image, ctx);
    expect(gemini.calls).toHaveLength(0);
    expect(result).toMatchObject({ provider: "openrouter", fallbackUsed: true });

    const none = service([scripted("gemini", []).provider], quota({ gemini: 0 }));
    await expect(none.run("read_label", image, ctx)).rejects.toBeInstanceOf(AiQuotaExhaustedError);
    expect(await none.hasCapacity()).toBe(false);
  });

  it("fails with AiUnavailable when every provider errors, or none is configured", async () => {
    const gemini = scripted("gemini", [new LlmError("bad key", "gemini", "AUTH_FAILED", false, 403)]);
    await expect(service([gemini.provider]).run("read_label", image, ctx)).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(service([]).run("read_label", image, ctx)).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("opens the circuit after repeated provider failures, then skips that provider without calling it", async () => {
    const failures = Array.from({ length: 6 }, () => new LlmError("503", "gemini", "PROVIDER_ERROR", true, 503));
    const gemini = scripted("gemini", failures);
    const openrouter = scripted("openrouter", Array.from({ length: 4 }, () => JSON.stringify(LABEL)));
    const llm = service([gemini.provider, openrouter.provider]);

    for (let i = 0; i < 3; i++) await llm.run("read_label", image, ctx);
    const callsWhenOpen = gemini.calls.length;
    expect((await llm.status())[0]).toMatchObject({ name: "gemini", circuitOpen: true });

    await llm.run("read_label", image, ctx);
    expect(gemini.calls.length).toBe(callsWhenOpen);
    llm.shutdown();
  });
});
