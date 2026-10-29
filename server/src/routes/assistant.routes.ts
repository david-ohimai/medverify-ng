import { Router } from "express";
import { assistantController } from "../controllers/assistant.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { apiLimiter, assistantDailyLimiter, assistantLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { assistantMessageSchema, conversationParamsSchema } from "../validators/assistant.validator.js";

export const assistantRoutes = Router();

assistantRoutes.use(authenticate, apiLimiter);

/**
 * @openapi
 * /api/v1/assistant/messages:
 *   post:
 *     tags: [Assistant]
 *     summary: Ask the assistant (Server-Sent Events)
 *     description: |
 *       An agent with read-only, Zod-validated tools chosen by the device's role. It answers questions
 *       about medicines from the registry, the user's own scans, hotspot warnings and **official WHO and
 *       NAFDAC documents only** (cited as [n]). At most 5 model rounds and 60 seconds.
 *
 *       Stream: `conversation` { conversationId } → `tool_start` { name, args } / `tool_end` { name, ok, summary }
 *       per tool call → `answer` { text } → `citations` [{ n, title, publisher, url, retrieved }] → `done`,
 *       or `error` { code, message }. Send `conversationId` to continue a conversation.
 *       Limits: 10 per minute and 100 per day per device (regulators 30 / 300).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "How do I report a fake drug?" }
 *               conversationId: { type: string, format: uuid }
 *     responses:
 *       200: { description: Event stream }
 *       404: { description: Conversation not found (or another device's) }
 *       429: { description: Too many questions, or today's AI quota is used up }
 * /api/v1/assistant/tools:
 *   get:
 *     tags: [Assistant]
 *     summary: The tools the assistant can use for this device's role
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ name, description }]" }
 * /api/v1/assistant/conversations/{id}:
 *   get:
 *     tags: [Assistant]
 *     summary: A conversation with its full execution trace (tool calls, arguments, result summaries, citations)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Transcript }
 *       404: { description: Not found (or another device's) }
 */
assistantRoutes.post("/messages", assistantLimiter, assistantDailyLimiter, validate(assistantMessageSchema), assistantController.ask);
assistantRoutes.get("/tools", assistantController.tools);
assistantRoutes.get("/conversations/:id", validate(conversationParamsSchema), assistantController.conversation);
