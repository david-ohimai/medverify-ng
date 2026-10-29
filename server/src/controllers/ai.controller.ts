import type { Request, Response } from "express";
import { sendSuccess } from "../lib/response.js";
import { aiAdminService } from "../services/aiAdmin.service.js";
import type { CreatePromptInput, ListAiCallsQuery, ListPromptsQuery, PromptParams } from "../validators/ai.validator.js";

export const aiController = {
  async status(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, 200, "AI status", await aiAdminService.status());
  },

  async listPrompts(req: Request, res: Response): Promise<void> {
    const { task } = req.validated.query as ListPromptsQuery;
    sendSuccess(res, 200, "Prompt versions", await aiAdminService.listPrompts(task));
  },

  async createPrompt(req: Request, res: Response): Promise<void> {
    const prompt = await aiAdminService.createPrompt(req.validated.body as CreatePromptInput);
    sendSuccess(res, 201, prompt.isActive ? "Prompt version created and activated" : "Prompt version created", prompt);
  },

  async activatePrompt(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as PromptParams;
    sendSuccess(res, 200, "Prompt version activated", await aiAdminService.activatePrompt(id));
  },

  async listCalls(req: Request, res: Response): Promise<void> {
    const { limit, task } = req.validated.query as ListAiCallsQuery;
    sendSuccess(res, 200, "Recent AI calls", await aiAdminService.listCalls(limit, task));
  },
};
