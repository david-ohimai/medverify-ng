import { Router } from "express";
import { verificationController } from "../controllers/verification.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { apiLimiter, verifyLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { listScansSchema, scanParamsSchema } from "../validators/scan.validator.js";
import { manualVerificationSchema } from "../validators/verification.validator.js";

export const verificationRoutes = Router();
export const scanRoutes = Router();

verificationRoutes.use(authenticate, apiLimiter);
scanRoutes.use(authenticate, apiLimiter);

/**
 * @openapi
 * /api/v1/verify/manual:
 *   post:
 *     tags: [Verification]
 *     summary: Check a typed-in NAFDAC number (and optionally name, batch, expiry) against the registry
 *     description: |
 *       Registry rules only — no AI, no photo. Returns a verdict (likely_genuine / suspicious /
 *       high_risk / unregistered), a 0–100 risk score, a confidence level and the signals that
 *       explain it. Saved to the device's scan history.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nafdacNo]
 *             properties:
 *               nafdacNo: { type: string, example: "A4-1234", description: "Any printed form; normalised" }
 *               productName: { type: string, example: "Coartem", description: "Name on the pack — catches a real number on the wrong product" }
 *               batchNo: { type: string, example: "LT2391" }
 *               expiry: { type: string, example: "2027-08", description: "YYYY-MM as printed, or YYYY-MM-DD" }
 *     responses:
 *       201: { description: Verdict with explainable signals }
 *       422: { description: Not a valid NAFDAC number / bad expiry }
 *       429: { description: Too many checks }
 */
verificationRoutes.post("/manual", verifyLimiter, validate(manualVerificationSchema), verificationController.verifyManual);

/**
 * @openapi
 * /api/v1/scans:
 *   get:
 *     tags: [Verification]
 *     summary: This device's scan history, newest first
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: Page of results, with pagination meta }
 * /api/v1/scans/{id}:
 *   get:
 *     tags: [Verification]
 *     summary: One of this device's scans
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: The scan's verdict and signals }
 *       404: { description: Not found (or another device's scan) }
 */
scanRoutes.get("/", validate(listScansSchema), verificationController.listScans);
scanRoutes.get("/:id", validate(scanParamsSchema), verificationController.getScan);
