import { z } from "zod";
import { AI_TASK_NAMES } from "../ai/tasks.js";

const taskField = z.enum(AI_TASK_NAMES as [string, ...string[]]);

export const listPromptsSchema = z.object({
  query: z.object({ task: taskField.optional() }),
});
export type ListPromptsQuery = z.infer<typeof listPromptsSchema>["query"];

export const createPromptSchema = z.object({
  body: z.strictObject({
    task: taskField,
    system: z.string().trim().min(50).max(8_000),
    notes: z.string().trim().max(500).optional(),
    /** Switch to it straight away (otherwise activate later). */
    activate: z.boolean().default(false),
  }),
});
export type CreatePromptInput = z.infer<typeof createPromptSchema>["body"];

export const promptParamsSchema = z.object({
  params: z.object({ id: z.uuid("Prompt id must be a UUID") }),
});
export type PromptParams = z.infer<typeof promptParamsSchema>["params"];

export const listAiCallsSchema = z.object({
  query: z.object({
    task: taskField.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});
export type ListAiCallsQuery = z.infer<typeof listAiCallsSchema>["query"];
