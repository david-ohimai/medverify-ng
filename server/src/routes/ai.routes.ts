import { Router } from "express";
import { aiController } from "../controllers/ai.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { createPromptSchema, listAiCallsSchema, listPromptsSchema, promptParamsSchema } from "../validators/ai.validator.js";

/** Model control plane — regulator mode only. */
export const aiRoutes = Router();

aiRoutes.use(authenticate, authorize("regulator"), apiLimiter);

/**
 * @openapi
 * /api/v1/ai/status:
 *   get:
 *     tags: [AI control plane]
 *     summary: Provider chain, circuit state, today's free quota, active prompt versions, 24 h usage
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Status }
 *       403: { description: Needs regulator mode }
 * /api/v1/ai/prompts:
 *   get:
 *     tags: [AI control plane]
 *     summary: Every prompt version, newest first per task
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: task, schema: { type: string, enum: [read_label, compare_pack, alert_summary, translate_verdict, assistant] } }
 *     responses:
 *       200: { description: Prompt versions }
 *   post:
 *     tags: [AI control plane]
 *     summary: Add a new prompt version for a task (optionally activate it at once)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [task, system]
 *             properties:
 *               task: { type: string, enum: [read_label, compare_pack, alert_summary, translate_verdict, assistant] }
 *               system: { type: string, description: "System prompt, 50–8000 characters" }
 *               notes: { type: string, description: "What changed and why" }
 *               activate: { type: boolean, default: false }
 *     responses:
 *       201: { description: Created }
 * /api/v1/ai/prompts/{id}/activate:
 *   post:
 *     tags: [AI control plane]
 *     summary: Make this version the active one for its task (also how you roll back)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Activated; takes effect immediately }
 *       404: { description: No such version }
 * /api/v1/ai/calls:
 *   get:
 *     tags: [AI control plane]
 *     summary: Recent AI calls from ai_audit_logs (provider, model, prompt version, tokens, latency, errors)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: task, schema: { type: string, enum: [read_label, compare_pack, alert_summary, translate_verdict, assistant] } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: "AI calls, newest first" }
 */
aiRoutes.get("/status", aiController.status);
aiRoutes.get("/prompts", validate(listPromptsSchema), aiController.listPrompts);
aiRoutes.post("/prompts", validate(createPromptSchema), aiController.createPrompt);
aiRoutes.post("/prompts/:id/activate", validate(promptParamsSchema), aiController.activatePrompt);
aiRoutes.get("/calls", validate(listAiCallsSchema), aiController.listCalls);
