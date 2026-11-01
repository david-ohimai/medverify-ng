import { Router } from "express";
import { reviewController } from "../controllers/review.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { listReviewsSchema, reviewDecisionSchema, reviewParamsSchema } from "../validators/review.validator.js";

/** Human-in-the-loop review queue — regulator mode (pharmacists / NAFDAC reviewers). */
export const reviewRoutes = Router();

reviewRoutes.use(authenticate, authorize("regulator"), apiLimiter);

/**
 * @openapi
 * /api/v1/reviews:
 *   get:
 *     tags: [Review queue]
 *     summary: Photo scans waiting for a human — escalated first, then by priority and deadline
 *     description: |
 *       Queued automatically: P1 "don't take it" (high risk / unregistered, 4 h SLA), P2 suspicious (24 h),
 *       P3 "likely genuine" but the photo raised a doubt (48 h). Overdue reviews escalate every 5 minutes.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [open, claimed, decided] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: Reviews with pagination meta }
 *       403: { description: Needs regulator mode }
 * /api/v1/reviews/stats:
 *   get:
 *     tags: [Review queue]
 *     summary: Open / urgent / overdue counts, and how often reviewers agree with the system
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Stats }
 * /api/v1/reviews/{id}:
 *   get:
 *     tags: [Review queue]
 *     summary: One review — what the AI read, every signal, the registry match and its reference photos
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Review }
 *       404: { description: Not found }
 * /api/v1/reviews/{id}/image:
 *   get:
 *     tags: [Review queue]
 *     summary: The pack photo (JPEG) — kept only until the review is decided, at most 7 days
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: JPEG }
 *       404: { description: No photo (decided or expired) }
 * /api/v1/reviews/{id}/claim:
 *   post:
 *     tags: [Review queue]
 *     summary: Take the review (for 1 hour). Fails with 409 if someone else holds it
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Claimed }
 *       409: { description: "Claimed by another reviewer, or already decided" }
 * /api/v1/reviews/{id}/decision:
 *   post:
 *     tags: [Review queue]
 *     summary: Decide a claimed review — agree, disagree (with the right verdict) or inconclusive
 *     description: The photo is deleted with the decision. The user sees the outcome (and note) on their scan.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [agree, disagree, inconclusive] }
 *               reviewedVerdict: { type: string, enum: [likely_genuine, suspicious, high_risk, unregistered], description: "Only with disagree" }
 *               note: { type: string, example: "Logo and fonts differ from the genuine pack; do not use." }
 *     responses:
 *       200: { description: Decided }
 *       409: { description: "Not claimed by you, or already decided" }
 *       422: { description: Missing / unexpected reviewedVerdict }
 */
reviewRoutes.get("/", validate(listReviewsSchema), reviewController.list);
reviewRoutes.get("/stats", reviewController.stats);
reviewRoutes.get("/:id", validate(reviewParamsSchema), reviewController.get);
reviewRoutes.get("/:id/image", validate(reviewParamsSchema), reviewController.image);
reviewRoutes.post("/:id/claim", validate(reviewParamsSchema), reviewController.claim);
reviewRoutes.post("/:id/decision", validate(reviewDecisionSchema), reviewController.decide);
