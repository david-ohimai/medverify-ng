import { z } from "zod";
import { config } from "../lib/config.js";
import { AiQuotaExhaustedError, AiUnavailableError } from "../lib/errors.js";
import { appEvents } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { getActivePrompt, type ActivePrompt } from "./prompts.js";
import { createGeminiProvider } from "./providers/gemini.provider.js";
import { createOpenRouterProvider } from "./providers/openrouter.provider.js";
import { aiQuota } from "./quota.js";
import { createBreaker, withRetry, type Breaker, type RetryOptions } from "./resilience.js";
import { AI_TASKS, type AiTaskName, type AiTaskOutput } from "./tasks.js";
import {
  LlmError,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type GenerateJsonResponse,
  type LlmPart,
  type LlmProvider,
  type LlmUsage,
  type ProviderName,
} from "./types.js";

export interface AiCallContext {
  /** Short, non-personal description of the input for the audit log. Never the image itself. */
  inputSummary: string;
  scanId?: string;
}

export interface AiResult<T> {
  data: T;
  provider: ProviderName;
  model: string;
  promptVersion: number;
  usage: LlmUsage;
  fallbackUsed: boolean;
}

export interface ProviderStatus {
  name: ProviderName;
  models: { vision: string; light: string };
  circuitOpen: boolean;
  quota: { used: number; limit: number };
}

interface Dependencies {
  providers: LlmProvider[];
  quota: Pick<typeof aiQuota, "reserve" | "used" | "remaining" | "limit">;
  getPrompt: (task: AiTaskName) => Promise<Pick<ActivePrompt, "version" | "system">>;
  retry: RetryOptions;
  /** Per-attempt deadline. */
  timeoutMs: number;
}

/** Zod → JSON Schema, once per task. Providers get plain JSON Schema without the $schema marker. */
const jsonSchemaCache = new Map<AiTaskName, Record<string, unknown>>();
function jsonSchemaFor(task: AiTaskName): Record<string, unknown> {
  let schema = jsonSchemaCache.get(task);
  if (!schema) {
    const { $schema: _ignored, ...rest } = z.toJSONSchema(AI_TASKS[task].schema) as Record<string, unknown>;
    schema = rest;
    jsonSchemaCache.set(task, schema);
  }
  return schema;
}

function summarise(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Zod issues as a short list the model can act on when asked to fix its reply. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * The model control plane. For each call it:
 *  1. loads the task's active prompt version;
 *  2. walks the provider chain (primary → fallback), skipping a provider
 *     whose circuit is open or whose daily free budget is spent;
 *  3. retries transient failures (honouring Retry-After) inside a circuit breaker;
 *  4. validates the JSON reply with the task's Zod schema, asking once for a
 *     corrected reply before giving up on that provider;
 *  5. emits one `ai:called` event per provider attempt → ai_audit_logs + metrics.
 */
export function createLlmService(deps: Dependencies) {
  const breakers = new Map<ProviderName, Breaker>(deps.providers.map((provider) => [provider.name, createBreaker(provider.name)]));

  async function callProvider(
    provider: LlmProvider,
    task: AiTaskName,
    prompt: Pick<ActivePrompt, "version" | "system">,
    parts: LlmPart[],
    context: AiCallContext,
    fallbackUsed: boolean
  ): Promise<AiResult<unknown>> {
    const definition = AI_TASKS[task];
    const breaker = breakers.get(provider.name)!;
    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    const started = Date.now();
    let outputSummary: string | null = null;
    // One task's schema; typed as unknown here, the caller gets the task's output type.
    const schema = definition.schema as z.ZodType<unknown>;
    let model = provider.modelFor(definition.tier);

    const generate = (requestParts: LlmPart[]) =>
      breaker.fire(() =>
        withRetry(
          () =>
            provider.generateJson({
              system: prompt.system,
              parts: requestParts,
              jsonSchema: jsonSchemaFor(task),
              tier: definition.tier,
              maxOutputTokens: definition.maxOutputTokens,
              // A hard deadline per attempt: SDK timeouts only cover parts of a request,
              // and a free model can otherwise stream for minutes.
              signal: AbortSignal.timeout(deps.timeoutMs),
            }),
          deps.retry
        )
      );

    const addUsage = (response: GenerateJsonResponse) => {
      model = response.model;
      usage.inputTokens = (usage.inputTokens ?? 0) + (response.usage.inputTokens ?? 0);
      usage.outputTokens = (usage.outputTokens ?? 0) + (response.usage.outputTokens ?? 0);
    };

    const audit = (success: boolean, errorCode: string | null) =>
      appEvents.emit("ai:called", {
        task,
        provider: provider.name,
        model,
        promptVersion: prompt.version,
        success,
        errorCode,
        fallbackUsed,
        inputSummary: summarise(context.inputSummary, 500),
        outputSummary,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs: Date.now() - started,
        scanId: context.scanId ?? null,
      });

    try {
      let response = await generate(parts);
      addUsage(response);
      let parsed = parseReply(schema, response.text);

      if (!parsed.success) {
        // One repair round: show the model exactly what was wrong.
        logger.warn({ event: "llm:invalid-output", provider: provider.name, task, issues: parsed.issues }, "Asking for a corrected reply");
        if (!(await deps.quota.reserve(provider.name))) {
          throw new LlmError("Quota used up during repair", provider.name, "QUOTA_EXHAUSTED", false);
        }
        response = await generate([
          ...parts,
          {
            type: "text",
            text: `Your previous reply did not match the required JSON schema (${parsed.issues}). Reply again with only valid JSON that matches the schema.`,
          },
        ]);
        addUsage(response);
        parsed = parseReply(schema, response.text);
        if (!parsed.success) {
          outputSummary = summarise(response.text, 1000);
          throw new LlmError(`Invalid output after repair: ${parsed.issues}`, provider.name, "INVALID_OUTPUT", false);
        }
      }

      outputSummary = summarise(parsed.data, 1000);
      audit(true, null);
      return { data: parsed.data, provider: provider.name, model, promptVersion: prompt.version, usage, fallbackUsed };
    } catch (err) {
      const code = err instanceof LlmError ? err.code : breaker.isOpen ? "CIRCUIT_OPEN" : "UNKNOWN";
      audit(false, code);
      throw err;
    }
  }

  /**
   * The provider chain shared by every kind of call: skip a provider whose
   * circuit is open or whose budget is spent, try the next one on failure,
   * and end with AiQuotaExhausted (all budgets spent) or AiUnavailable.
   */
  async function throughChain<T>(task: string, attempt: (provider: LlmProvider, fallbackUsed: boolean) => Promise<T>): Promise<T> {
    if (deps.providers.length === 0) {
      throw new AiUnavailableError("No AI provider is configured (set GEMINI_API_KEY in server/.env).");
    }
    const skipped: string[] = [];
    for (const [index, provider] of deps.providers.entries()) {
      if (breakers.get(provider.name)!.isOpen) {
        skipped.push(`${provider.name}:CIRCUIT_OPEN`);
        continue;
      }
      if (!(await deps.quota.reserve(provider.name))) {
        skipped.push(`${provider.name}:QUOTA_EXHAUSTED`);
        continue;
      }
      try {
        return await attempt(provider, index > 0);
      } catch (err) {
        const code = err instanceof LlmError ? err.code : "CIRCUIT_OPEN";
        skipped.push(`${provider.name}:${code}`);
        logger.warn(
          { event: "llm:provider-failed", provider: provider.name, task, code, message: (err as Error).message },
          index < deps.providers.length - 1 ? "Provider failed; falling back" : "Last provider failed"
        );
      }
    }
    logger.error({ event: "llm:all-providers-failed", task, attempts: skipped }, "No AI provider could answer");
    if (skipped.every((reason) => reason.endsWith(":QUOTA_EXHAUSTED"))) throw new AiQuotaExhaustedError();
    throw new AiUnavailableError();
  }

  return {
    /** Runs an AI task and returns validated, typed output, or throws AiUnavailable / AiQuotaExhausted. */
    async run<K extends AiTaskName>(task: K, parts: LlmPart[], context: AiCallContext): Promise<AiResult<AiTaskOutput<K>>> {
      if (deps.providers.length === 0) {
        throw new AiUnavailableError("No AI provider is configured (set GEMINI_API_KEY in server/.env).");
      }
      const prompt = await deps.getPrompt(task);
      return throughChain(task, (provider, fallbackUsed) =>
        callProvider(provider, task, prompt, parts, context, fallbackUsed)
      ) as Promise<AiResult<AiTaskOutput<K>>>;
    },

    /**
     * One round of a tool-calling conversation, through the same chain,
     * retries, circuit breakers, budget and audit as every other call.
     * The caller (the assistant) runs the tools and loops.
     */
    async chat(
      request: Omit<ChatRequest, "signal" | "tier" | "maxOutputTokens">,
      context: AiCallContext & { promptVersion: number }
    ): Promise<ChatResponse & { provider: ProviderName; fallbackUsed: boolean }> {
      return throughChain("assistant", async (provider, fallbackUsed) => {
        const breaker = breakers.get(provider.name)!;
        const started = Date.now();
        const audit = (success: boolean, errorCode: string | null, response?: ChatResponse) =>
          appEvents.emit("ai:called", {
            task: "assistant",
            provider: provider.name,
            model: response?.model ?? provider.modelFor("light"),
            promptVersion: context.promptVersion,
            success,
            errorCode,
            fallbackUsed,
            inputSummary: summarise(context.inputSummary, 500),
            outputSummary: response
              ? summarise(response.toolCalls.length > 0 ? `tools: ${response.toolCalls.map((c) => c.name).join(", ")}` : (response.text ?? ""), 1000)
              : null,
            inputTokens: response?.usage.inputTokens ?? null,
            outputTokens: response?.usage.outputTokens ?? null,
            latencyMs: Date.now() - started,
            scanId: null,
          });
        try {
          const response = await breaker.fire(() =>
            withRetry(
              () =>
                provider.chat({
                  ...request,
                  // Gemini's raw parts only make sense to Gemini; other providers get the plain form.
                  messages: request.messages.map((message) =>
                    message.role === "assistant" && message.providerParts?.provider !== provider.name
                      ? { ...message, providerParts: undefined }
                      : message
                  ) as ChatMessage[],
                  // Text and tools only: the light model has a higher free per-minute limit.
                  tier: "light",
                  maxOutputTokens: 2048,
                  signal: AbortSignal.timeout(deps.timeoutMs),
                }),
              deps.retry
            )
          );
          audit(true, null, response);
          return { ...response, provider: provider.name, fallbackUsed };
        } catch (err) {
          audit(false, err instanceof LlmError ? err.code : breaker.isOpen ? "CIRCUIT_OPEN" : "UNKNOWN");
          throw err;
        }
      });
    },

    /** Can any provider take a call right now? Checked before a scan is queued. */
    async hasCapacity(): Promise<boolean> {
      for (const provider of deps.providers) {
        if (!breakers.get(provider.name)!.isOpen && (await deps.quota.remaining(provider.name)) > 0) return true;
      }
      return false;
    },

    get configured(): boolean {
      return deps.providers.length > 0;
    },

    async status(): Promise<ProviderStatus[]> {
      return Promise.all(
        deps.providers.map(async (provider) => ({
          name: provider.name,
          models: { vision: provider.modelFor("vision"), light: provider.modelFor("light") },
          circuitOpen: breakers.get(provider.name)!.isOpen,
          quota: { used: await deps.quota.used(provider.name), limit: deps.quota.limit(provider.name) },
        }))
      );
    },

    shutdown() {
      for (const breaker of breakers.values()) breaker.shutdown();
    },
  };
}

function parseReply<T>(
  schema: z.ZodType<T>,
  text: string
): { success: true; data: T } | { success: false; issues: string } {
  let json: unknown;
  try {
    // Some models wrap JSON in a ```json fence despite being asked not to.
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { success: false, issues: "reply was not valid JSON" };
  }
  const result = schema.safeParse(json);
  return result.success ? { success: true, data: result.data } : { success: false, issues: describeIssues(result.error) };
}

/** Primary first, then the fallback; a provider without an API key is left out. */
function configuredProviders(): LlmProvider[] {
  const factories: Record<ProviderName, () => LlmProvider | null> = {
    gemini: () => (config.GEMINI_API_KEY ? createGeminiProvider(config.GEMINI_API_KEY) : null),
    openrouter: () => (config.OPENROUTER_API_KEY ? createOpenRouterProvider(config.OPENROUTER_API_KEY) : null),
  };
  const order: ProviderName[] = [config.LLM_PRIMARY];
  if (config.LLM_FALLBACK !== "none" && config.LLM_FALLBACK !== config.LLM_PRIMARY) order.push(config.LLM_FALLBACK);
  return order.map((name) => factories[name]()).filter((provider): provider is LlmProvider => provider !== null);
}

export const llmService = createLlmService({
  providers: configuredProviders(),
  quota: aiQuota,
  getPrompt: getActivePrompt,
  retry: { attempts: 2, baseDelayMs: 1_000, maxDelayMs: 8_000 },
  timeoutMs: config.LLM_TIMEOUT_MS,
});
