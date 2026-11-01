import { ApiError, GoogleGenAI } from "@google/genai";
import { config } from "../lib/config.js";
import { AiQuotaExhaustedError, AiUnavailableError } from "../lib/errors.js";
import { appEvents } from "../lib/events.js";
import { geminiRetryAfterMs } from "./providers/gemini.provider.js";
import { aiQuota } from "./quota.js";
import { createBreaker, withRetry } from "./resilience.js";
import { codeForStatus, isRetryableStatus, LlmError } from "./types.js";

export const EMBEDDING_MODEL = "gemini-embedding-001";
/** Must match the kb_chunks.embedding column: vector(768). */
export const EMBEDDING_DIMENSIONS = 768;
/** Gemini accepts up to 100 texts per call. */
const BATCH_SIZE = 100;

/** Documents and questions are embedded differently, which improves retrieval. */
export type EmbeddingPurpose = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

let client: GoogleGenAI | undefined;
const breaker = createBreaker("gemini-embeddings");

/** Unit length, so cosine distance is a plain dot product and reduced-size vectors stay comparable. */
function normalise(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / length);
}

async function embedBatch(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]> {
  client ??= new GoogleGenAI({ apiKey: config.GEMINI_API_KEY!, httpOptions: { retryOptions: { attempts: 1 } } });
  try {
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts,
      config: { taskType: purpose, outputDimensionality: EMBEDDING_DIMENSIONS, abortSignal: AbortSignal.timeout(config.LLM_TIMEOUT_MS) },
    });
    const vectors = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
      throw new LlmError(`Expected ${texts.length} vectors of ${EMBEDDING_DIMENSIONS}`, "gemini", "INVALID_OUTPUT", false);
    }
    return vectors.map(normalise);
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof ApiError) {
      throw new LlmError(err.message.slice(0, 300), "gemini", codeForStatus(err.status), isRetryableStatus(err.status), err.status, geminiRetryAfterMs(err.message));
    }
    throw new LlmError((err as Error).message, "gemini", "NETWORK_ERROR", true);
  }
}

/**
 * Embeddings for the knowledge base (documents) and for questions. Gemini
 * only, OpenRouter has no embedding API, so callers must cope with
 * AiUnavailable: the knowledge search falls back to keyword search.
 * Same resilience as every other AI call: retry with Retry-After, circuit
 * breaker, daily budget (one unit per batch), an `ai:called` audit row.
 */
export async function embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]> {
  if (!config.GEMINI_API_KEY) throw new AiUnavailableError("Embeddings need GEMINI_API_KEY");
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    if (breaker.isOpen) throw new AiUnavailableError();
    if (!(await aiQuota.reserve("gemini"))) throw new AiQuotaExhaustedError();

    const started = Date.now();
    const audit = (success: boolean, errorCode: string | null) =>
      appEvents.emit("ai:called", {
        task: "embed",
        provider: "gemini",
        model: EMBEDDING_MODEL,
        promptVersion: null,
        success,
        errorCode,
        fallbackUsed: false,
        inputSummary: `${batch.length} ${purpose === "RETRIEVAL_QUERY" ? "question" : "passage"}(s), ${batch.reduce((n, t) => n + t.length, 0)} chars`,
        outputSummary: success ? `${batch.length} × ${EMBEDDING_DIMENSIONS}-d vectors` : null,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        scanId: null,
      });

    try {
      vectors.push(
        ...(await breaker.fire(() => withRetry(() => embedBatch(batch, purpose), { attempts: 2, baseDelayMs: 1_000, maxDelayMs: 8_000 })))
      );
      audit(true, null);
    } catch (err) {
      audit(false, err instanceof LlmError ? err.code : "CIRCUIT_OPEN");
      throw new AiUnavailableError();
    }
  }
  return vectors;
}

/** pgvector's text format: '[0.1,0.2,…]'. */
export const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;
