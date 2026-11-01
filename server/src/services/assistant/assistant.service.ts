import { llmService } from "../../ai/llm.service.js";
import { getActivePrompt } from "../../ai/prompts.js";
import type { ChatMessage, ToolCall } from "../../ai/types.js";
import type { DeviceRole } from "../../generated/prisma/enums.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { appEvents } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import { assistantRepository } from "../../repositories/assistant.repository.js";
import { runTool, toolParameters, toolsFor, type Citation, type ToolContext } from "./tools.js";

/** Bounds on one answer: model rounds, tool calls per round, total time. */
export const MAX_ROUNDS = 5;
const MAX_CALLS_PER_ROUND = 4;
const ANSWER_DEADLINE_MS = 60_000;
const TOOL_TIMEOUT_MS = 10_000;
const HISTORY_TURNS = 10;

export type AssistantEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_end"; name: string; ok: boolean; summary: string }
  | { type: "answer"; text: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "done"; conversationId: string; rounds: number; provider: string | null }
  | { type: "error"; code: string; message: string };

/**
 * Phrases that try to override the assistant's instructions. A match never
 * blocks the question (that would be easy to dodge and annoying when wrong):
 * it is logged and counted, and the system prompt and read-only tools are
 * the real defence.
 */
const INJECTION_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above) (instructions|prompts?)/i,
  /(system|developer) prompt/i,
  /you are now\b/i,
  /disregard (your|the) (rules|instructions)/i,
  /\bjailbreak\b/i,
  /(drop|delete|truncate|update)\s+(table|from)\b/i,
];

export function looksLikeInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(message));
}

/** Keeps only the sources the answer actually cites, [1], [1, 2] or [1][2], in order. */
export function citedSources(text: string, citations: Citation[]): Citation[] {
  const used = new Set(
    [...text.matchAll(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g)].flatMap((match) => match[1]!.split(",").map((n) => Number(n.trim())))
  );
  return citations.filter((citation) => used.has(citation.n));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("tool timed out")), ms).unref())]);
}

export const assistantService = {
  /** The tools this role can use, for the app's "what can I ask?" sheet. */
  tools(role: DeviceRole) {
    return toolsFor(role).map((tool) => ({ name: tool.name, description: tool.description }));
  },

  async transcript(deviceId: string, conversationId: string) {
    const conversation = await assistantRepository.findConversation(conversationId, deviceId);
    if (!conversation) throw new NotFoundError("Conversation not found");
    return { ...conversation, messages: await assistantRepository.listMessages(conversationId) };
  },

  /**
   * One question → a stream of events: each tool call as it starts and
   * ends, then the answer, the sources it cited, and done. The agent loop:
   * the model either answers or asks for tools; tools run (validated,
   * role-checked, read-only); their results go back; at most 5 rounds and
   * 60 seconds. Everything, question, tool trace, answer, is saved.
   */
  async *ask(
    deviceId: string,
    role: DeviceRole,
    input: { message: string; conversationId?: string | undefined }
  ): AsyncGenerator<AssistantEvent> {
    const conversationId = input.conversationId
      ? ((await assistantRepository.findConversation(input.conversationId, deviceId))?.id ?? null)
      : (await assistantRepository.createConversation(deviceId, role)).id;
    if (!conversationId) throw new NotFoundError("Conversation not found");
    yield { type: "conversation", conversationId };

    if (looksLikeInjection(input.message)) {
      logger.warn({ event: "assistant:injection-suspected", deviceId, conversationId }, "Possible prompt injection");
      appEvents.emit("assistant:injection-suspected", { deviceId, conversationId });
    }

    const history = await assistantRepository.recentTurns(conversationId, HISTORY_TURNS);
    await assistantRepository.addMessage({ conversationId, role: "user", content: input.message });

    const prompt = await getActivePrompt("assistant");
    const today = new Date().toISOString().slice(0, 10);
    const system = `${prompt.system}\n\nToday is ${today}. This user is ${role === "regulator" ? "a NAFDAC regulator (regulator tools are available)" : "a member of the public"}.`;
    const tools = toolsFor(role);
    const toolSpecs = tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: toolParameters(tool.schema) }));

    const messages: ChatMessage[] = [
      ...history.map((turn): ChatMessage =>
        turn.role === "user" ? { role: "user", text: turn.content } : { role: "assistant", text: turn.content, toolCalls: [] }
      ),
      { role: "user", text: input.message },
    ];
    const context: ToolContext = { deviceId, role, citations: [] };
    const deadline = Date.now() + ANSWER_DEADLINE_MS;
    const toolsUsed: string[] = [];
    let provider: string | null = null;

    try {
      for (let round = 1; round <= MAX_ROUNDS + 1; round++) {
        // Out of rounds or time: one last call with no tools, to answer from what was found.
        const lastChance = round > MAX_ROUNDS || Date.now() > deadline;
        const response = await llmService.chat(
          {
            system: lastChance ? `${system}\n\nAnswer now from the tool results you already have; no more tools.` : system,
            messages,
            tools: lastChance ? [] : toolSpecs,
          },
          { inputSummary: `assistant round ${round}: ${input.message.slice(0, 200)}`, promptVersion: prompt.version }
        );
        provider = response.provider;

        if (response.toolCalls.length === 0 || lastChance) {
          const text = response.text ?? "Sorry, I couldn't put an answer together. Please try rephrasing.";
          const citations = citedSources(text, context.citations);
          await assistantRepository.addMessage({ conversationId, role: "assistant", content: text, citations: citations as unknown as object[] });
          appEvents.emit("assistant:answered", { conversationId, deviceId, rounds: round, tools: toolsUsed, provider: response.provider });
          yield { type: "answer", text };
          yield { type: "citations", citations };
          yield { type: "done", conversationId, rounds: round, provider };
          return;
        }

        const calls: ToolCall[] = response.toolCalls.slice(0, MAX_CALLS_PER_ROUND);
        messages.push({
          role: "assistant",
          text: response.text,
          toolCalls: calls,
          ...(response.providerParts ? { providerParts: response.providerParts } : {}),
        });

        for (const call of calls) {
          yield { type: "tool_start", name: call.name, args: call.args };
          let outcome: Awaited<ReturnType<typeof runTool>>;
          try {
            outcome = await withTimeout(runTool(call.name, call.args, context), TOOL_TIMEOUT_MS);
          } catch (err) {
            outcome = { ok: false, args: call.args, data: { error: "The tool failed; try another way." }, summary: (err as Error).message };
          }
          toolsUsed.push(call.name);
          appEvents.emit("assistant:tool-called", { tool: call.name, ok: outcome.ok });
          await assistantRepository.addMessage({
            conversationId,
            role: "tool",
            content: JSON.stringify(outcome.data).slice(0, 4_000),
            toolName: call.name,
            toolArgs: (outcome.args ?? {}) as object,
            toolResultSummary: outcome.summary.slice(0, 1_000),
          });
          messages.push({ role: "tool", callId: call.id, name: call.name, result: outcome.data });
          yield { type: "tool_end", name: call.name, ok: outcome.ok, summary: outcome.summary };
        }
      }
    } catch (err) {
      const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";
      const message = err instanceof AppError ? err.message : "Something went wrong. Please try again.";
      if (!(err instanceof AppError)) logger.error({ event: "assistant:failed", conversationId, message: (err as Error).message }, "Assistant failed");
      yield { type: "error", code, message };
    }
  },
};
