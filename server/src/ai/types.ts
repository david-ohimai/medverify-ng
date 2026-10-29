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

export interface LlmProvider {
  readonly name: ProviderName;
  modelFor(tier: ModelTier): string;
  generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse>;
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
