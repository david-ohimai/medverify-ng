import { llmService } from "../ai/llm.service.js";
import { clearPromptCache, getActivePrompt } from "../ai/prompts.js";
import { PROMPT_TASKS, type PromptTask } from "../ai/tasks.js";
import { NotFoundError } from "../lib/errors.js";
import { aiAuditLogRepository } from "../repositories/aiAuditLog.repository.js";
import { promptRepository } from "../repositories/prompt.repository.js";
import type { CreatePromptInput } from "../validators/ai.validator.js";

/**
 * The model control plane's API (regulator mode): which providers and
 * models are live, how much of today's free quota is used, which prompt
 * version each task runs, and what every AI call did.
 */
export const aiAdminService = {
  async status() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [providers, prompts, usage] = await Promise.all([
      llmService.status(),
      Promise.all(PROMPT_TASKS.map(async (task) => ({ task, ...(await getActivePrompt(task)) }))),
      aiAuditLogRepository.usageSince(since),
    ]);
    return {
      providers,
      activePrompts: prompts.map(({ task, version, source }) => ({ task, version, source })),
      last24h: {
        fallbacks: usage.fallbacks,
        byModel: usage.rows.map((row) => ({
          provider: row.provider,
          model: row.model,
          success: row.success,
          calls: row._count._all,
          inputTokens: row._sum.inputTokens ?? 0,
          outputTokens: row._sum.outputTokens ?? 0,
          avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
        })),
      },
    };
  },

  listPrompts(task?: string) {
    return promptRepository.list(task);
  },

  async createPrompt(input: CreatePromptInput) {
    const created = await promptRepository.create(input.task, input.system, input.notes ?? null);
    if (!input.activate) return created;
    return this.activatePrompt(created.id);
  },

  async activatePrompt(id: string) {
    const prompt = await promptRepository.findById(id);
    if (!prompt) throw new NotFoundError("Prompt version not found");
    const activated = await promptRepository.activate(id, prompt.task);
    await clearPromptCache(prompt.task as PromptTask);
    return activated;
  },

  listCalls(limit: number, task?: string) {
    return aiAuditLogRepository.listRecent(limit, task);
  },
};
