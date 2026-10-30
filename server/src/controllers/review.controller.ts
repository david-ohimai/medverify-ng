import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { sendSuccess } from "../lib/response.js";
import { reviewService } from "../services/review/review.service.js";
import type { ListReviewsQuery, ReviewDecisionInput, ReviewParams } from "../validators/review.validator.js";

function reviewerId(req: Request): string {
  if (!req.device) throw new UnauthorizedError();
  return req.device.id;
}

export const reviewController = {
  async list(req: Request, res: Response): Promise<void> {
    const { status, page, limit } = req.validated.query as ListReviewsQuery;
    const { items, meta } = await reviewService.list(status, page, limit);
    sendSuccess(res, 200, "Review queue", items, meta);
  },

  async stats(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, 200, "Review queue stats", await reviewService.stats());
  },

  async get(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as ReviewParams;
    sendSuccess(res, 200, "Review", await reviewService.get(id));
  },

  /** The pack photo — never cached anywhere: it is deleted when the review is decided. */
  async image(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as ReviewParams;
    const image = await reviewService.image(id);
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "no-store" }).status(200).send(image);
  },

  async claim(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as ReviewParams;
    sendSuccess(res, 200, "Review claimed for 1 hour", await reviewService.claim(id, reviewerId(req)));
  },

  async decide(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as ReviewParams;
    const review = await reviewService.decide(id, reviewerId(req), req.validated.body as ReviewDecisionInput);
    sendSuccess(res, 200, "Decision saved; the user sees it with their scan", review);
  },
};
