/**
 * The one interface the rest of the app talks to. The scan pipeline (and,
 * later, alerts and the agent) never import a vendor SDK: they ask for a
 * task, and the LLM service picks a provider, a model and a prompt version.
 */

export type ProviderName = "gemini" | "openrouter";

/** Which model size a task needs. Each provider maps a tier to one of its models. */
export type ModelTier = "vision" | "light";

export type LlmPart = { type: "text"; text: string } | { type: "image"; mimeType: string; data: Buffer };

export interface LlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface GenerateJsonRequest {
  system: string;
  parts: LlmPart[];
  /** JSON Schema the reply must follow (built from the task's Zod schema). */
  jsonSchema: Record<string, unknown>;
  tier: ModelTier;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface GenerateJsonResponse {
  /** Raw JSON text from the model. The caller parses and validates it. */
  text: string;
  model: string;
  usage: LlmUsage;
}

/** A tool the model may call: name, what it's for, and its arguments as JSON Schema. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string | null;
      toolCalls: ToolCall[];
      /**
       * The provider's raw reply, replayed as-is to the same provider on the
       * next round (Gemini 3 requires its thought signatures back).
       */
      providerParts?: { provider: ProviderName; parts: unknown[] };
    }
  | { role: "tool"; callId: string; name: string; result: unknown };

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  tier: ModelTier;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  /** The model's answer, or null when it only asked for tools. */
  text: string | null;
  toolCalls: ToolCall[];
  providerParts?: { provider: ProviderName; parts: unknown[] };
  model: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: ProviderName;
  modelFor(tier: ModelTier): string;
  generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse>;
  /** One round of a tool-calling conversation: the model answers or asks for tool calls. */
  chat(request: ChatRequest): Promise<ChatResponse>;
}

/**
 * A provider call that failed. `retryable` says whether trying the same
 * provider again could help (rate limit, overload, timeout); `retryAfterMs`
 * is the provider's own hint, which always wins over our backoff.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderName,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Status codes worth retrying: timeout, rate limit, server errors. */
export function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

export function codeForStatus(status: number | undefined): string {
  if (status === undefined) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status >= 500) return "PROVIDER_ERROR";
  return "BAD_REQUEST";
}
