import OpenAI, { APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "../../lib/config.js";
import { codeForStatus, isRetryableStatus, LlmError, type ChatRequest, type GenerateJsonRequest, type LlmProvider } from "../types.js";

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const value = headers?.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (err instanceof APIConnectionTimeoutError || err instanceof APIUserAbortError) {
    return new LlmError("OpenRouter request timed out", "openrouter", "TIMEOUT", true);
  }
  if (err instanceof APIError) {
    return new LlmError(
      `OpenRouter ${err.status ?? "?"}: ${err.message.slice(0, 300)}`,
      "openrouter",
      codeForStatus(err.status),
      isRetryableStatus(err.status),
      err.status,
      retryAfterMs(err.headers)
    );
  }
  return new LlmError(
    `OpenRouter request failed: ${err instanceof Error ? err.message : String(err)}`,
    "openrouter",
    "NETWORK_ERROR",
    true
  );
}

/**
 * OpenRouter speaks the OpenAI API, so the official `openai` SDK works with a
 * different base URL. Only free models (ids ending in ":free") are used, and
 * only as the fallback: their daily caps are low.
 */
export function createOpenRouterProvider(apiKey: string): LlmProvider {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: config.LLM_TIMEOUT_MS,
    maxRetries: 0,
    defaultHeaders: { "X-Title": "MedVerify NG" },
  });
  const model = config.OPENROUTER_MODEL;

  return {
    name: "openrouter",
    // One free vision model serves both tiers.
    modelFor: () => model,

    async generateJson(request: GenerateJsonRequest) {
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            temperature: 0,
            max_tokens: request.maxOutputTokens,
            response_format: {
              type: "json_schema",
              json_schema: { name: "result", schema: request.jsonSchema, strict: false },
            },
            messages: [
              { role: "system", content: request.system },
              {
                role: "user",
                content: request.parts.map((part) =>
                  part.type === "text"
                    ? { type: "text" as const, text: part.text }
                    : {
                        type: "image_url" as const,
                        image_url: { url: `data:${part.mimeType};base64,${part.data.toString("base64")}` },
                      }
                ),
              },
            ],
          },
          request.signal ? { signal: request.signal } : undefined
        );

        const text = completion.choices[0]?.message.content;
        if (!text) {
          throw new LlmError(
            `OpenRouter returned no text (${completion.choices[0]?.finish_reason ?? "EMPTY"})`,
            "openrouter",
            "EMPTY_RESPONSE",
            false
          );
        }
        return {
          text,
          model: completion.model || model,
          usage: {
            inputTokens: completion.usage?.prompt_tokens ?? null,
            outputTokens: completion.usage?.completion_tokens ?? null,
          },
        };
      } catch (err) {
        throw toLlmError(err);
      }
    },

    async chat(request: ChatRequest) {
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: request.system },
        ...request.messages.map((message): ChatCompletionMessageParam => {
          if (message.role === "user") return { role: "user", content: message.text };
          if (message.role === "tool") return { role: "tool", tool_call_id: message.callId, content: JSON.stringify(message.result) };
          return {
            role: "assistant",
            content: message.text,
            ...(message.toolCalls.length > 0
              ? {
                  tool_calls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function" as const,
                    function: { name: call.name, arguments: JSON.stringify(call.args) },
                  })),
                }
              : {}),
          };
        }),
      ];

      try {
        const completion = await client.chat.completions.create(
          {
            model,
            temperature: 0.2,
            max_tokens: request.maxOutputTokens,
            messages,
            ...(request.tools.length > 0
              ? {
                  tools: request.tools.map((tool) => ({
                    type: "function" as const,
                    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
                  })),
                }
              : {}),
          },
          request.signal ? { signal: request.signal } : undefined
        );

        const message = completion.choices[0]?.message;
        const toolCalls = (message?.tool_calls ?? [])
          .filter((call) => call.type === "function")
          .map((call) => {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              // Malformed arguments are caught by the tool's own validation.
            }
            return { id: call.id, name: call.function.name, args };
          });
        const text = message?.content?.trim() || null;
        if (!text && toolCalls.length === 0) {
          throw new LlmError(`OpenRouter returned nothing (${completion.choices[0]?.finish_reason ?? "EMPTY"})`, "openrouter", "EMPTY_RESPONSE", false);
        }
        return {
          text,
          toolCalls,
          model: completion.model || model,
          usage: {
            inputTokens: completion.usage?.prompt_tokens ?? null,
            outputTokens: completion.usage?.completion_tokens ?? null,
          },
        };
      } catch (err) {
        throw toLlmError(err);
      }
    },
  };
}
