import { cacheDel, cacheGetJson, cacheKeys, cacheSetJson, CACHE_TTL } from "../lib/cache.js";
import { logger } from "../lib/logger.js";
import { promptRepository } from "../repositories/prompt.repository.js";
import { defaultPromptFor, type PromptTask } from "./tasks.js";

export interface ActivePrompt {
  version: number;
  system: string;
  /** "database" normally; "builtin" if the table has no active row (fresh DB, outage). */
  source: "database" | "builtin";
}

/**
 * The active prompt for a task: Redis (5 min) → database → the built-in
 * default. A prompt change takes effect within the cache TTL, or at once
 * when it is activated through the API (which clears the key).
 */
export async function getActivePrompt(task: PromptTask): Promise<ActivePrompt> {
  const key = cacheKeys.activePrompt(task);
  const cached = await cacheGetJson<ActivePrompt>(key);
  if (cached) return cached;

  let prompt: ActivePrompt;
  try {
    const row = await promptRepository.findActive(task);
    prompt = row
      ? { version: row.version, system: row.system, source: "database" }
      : { ...builtinPrompt(task), source: "builtin" };
  } catch (err) {
    logger.warn({ event: "ai:prompt-lookup-failed", task, message: (err as Error).message }, "Using built-in prompt");
    return { ...builtinPrompt(task), source: "builtin" };
  }

  await cacheSetJson(key, prompt, CACHE_TTL.activePrompt);
  return prompt;
}

export function builtinPrompt(task: PromptTask): { version: number; system: string } {
  const { version, system } = defaultPromptFor(task);
  return { version, system };
}

export const clearPromptCache = (task: PromptTask) => cacheDel(cacheKeys.activePrompt(task));
