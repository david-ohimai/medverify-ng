import { z } from "zod";

export const listReviewsSchema = z.object({
  query: z.object({
    status: z.enum(["open", "claimed", "decided"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
export type ListReviewsQuery = z.infer<typeof listReviewsSchema>["query"];

export const reviewParamsSchema = z.object({
  params: z.object({ id: z.uuid("Review id must be a UUID") }),
});
export type ReviewParams = z.infer<typeof reviewParamsSchema>["params"];

export const reviewDecisionSchema = z.object({
  params: reviewParamsSchema.shape.params,
  body: z.strictObject({
    decision: z.enum(["agree", "disagree", "inconclusive"]),
    /** Required when disagreeing; not allowed otherwise. */
    reviewedVerdict: z.enum(["likely_genuine", "suspicious", "high_risk", "unregistered"]).optional(),
    /** Shown to the user with their scan. */
    note: z.string().trim().min(3).max(500).optional(),
  }),
});
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>["body"];
