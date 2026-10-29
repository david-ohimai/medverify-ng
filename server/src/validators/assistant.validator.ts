import { z } from "zod";

export const assistantMessageSchema = z.object({
  body: z.strictObject({
    message: z.string().trim().min(1, "Ask something").max(1_000, "Keep questions under 1,000 characters"),
    /** Continue an earlier conversation (this device's own). */
    conversationId: z.uuid().optional(),
  }),
});
export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>["body"];

export const conversationParamsSchema = z.object({
  params: z.object({ id: z.uuid("Conversation id must be a UUID") }),
});
export type ConversationParams = z.infer<typeof conversationParamsSchema>["params"];
