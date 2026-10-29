import { ApiError, GoogleGenAI } from "@google/genai";
import { config } from "../../lib/config.js";
import { codeForStatus, isRetryableStatus, LlmError, type GenerateJsonRequest, type LlmProvider, type ModelTier } from "../types.js";

/**
 * Gemini rate-limit errors carry the wait in the body
 * ("retryDelay": "31s" or "Please retry in 12.5s") rather than a header.
 */
export function geminiRetryAfterMs(message: string): number | undefined {
  const match = /retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"|retry in (\d+(?:\.\d+)?)s/i.exec(message);
  const seconds = match ? Number(match[1] ?? match[2]) : NaN;
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : undefined;
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (err instanceof ApiError) {
    return new LlmError(
      `Gemini ${err.status}: ${err.message.slice(0, 300)}`,
      "gemini",
      codeForStatus(err.status),
      isRetryableStatus(err.status),
      err.status,
      geminiRetryAfterMs(err.message)
    );
  }
  const name = err instanceof Error ? err.name : "";
  const timedOut = name === "AbortError" || name === "TimeoutError";
  return new LlmError(
    `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
    "gemini",
    timedOut ? "TIMEOUT" : "NETWORK_ERROR",
    true
  );
}

export function createGeminiProvider(apiKey: string): LlmProvider {
  // Retries are ours (they honour the quota and the circuit breaker), so the SDK's are off.
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: config.LLM_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  const models: Record<ModelTier, string> = { vision: config.GEMINI_VISION_MODEL, light: config.GEMINI_LIGHT_MODEL };

  return {
    name: "gemini",
    modelFor: (tier) => models[tier],

    async generateJson(request: GenerateJsonRequest) {
      const model = models[request.tier];
      try {
        const response = await client.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: request.parts.map((part) =>
                part.type === "text"
                  ? { text: part.text }
                  : { inlineData: { mimeType: part.mimeType, data: part.data.toString("base64") } }
              ),
            },
          ],
          config: {
            systemInstruction: request.system,
            responseMimeType: "application/json",
            responseJsonSchema: request.jsonSchema,
            maxOutputTokens: request.maxOutputTokens,
            temperature: 0,
            ...(request.signal ? { abortSignal: request.signal } : {}),
          },
        });

        const text = response.text;
        if (!text) {
          const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason ?? "EMPTY";
          throw new LlmError(`Gemini returned no text (${reason})`, "gemini", "EMPTY_RESPONSE", false);
        }
        return {
          text,
          model,
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount ?? null,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
          },
        };
      } catch (err) {
        throw toLlmError(err);
      }
    },
  };
}
