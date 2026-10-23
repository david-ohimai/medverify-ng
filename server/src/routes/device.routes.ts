import { Router } from "express";
import { deviceController } from "../controllers/device.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { apiLimiter, pinLimiter, refreshLimiter, registerLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  elevateDeviceSchema,
  refreshTokenSchema,
  registerDeviceSchema,
  updateDeviceSchema,
} from "../validators/device.validator.js";

export const deviceRoutes = Router();

/**
 * @openapi
 * /api/v1/devices/register:
 *   post:
 *     tags: [Devices]
 *     summary: Register this install and get tokens (no sign-up needed)
 *     description: Called silently on first launch, and again if the refresh token is lost or expired. Re-registering resets regulator mode.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [installId, platform, appVersion]
 *             properties:
 *               installId: { type: string, format: uuid, description: "Random UUID v4 generated once by the app" }
 *               platform: { type: string, enum: [android, ios] }
 *               appVersion: { type: string, example: "1.0.0+1" }
 *               language: { type: string, enum: [en, pcm, ha, yo, ig], default: en }
 *     responses:
 *       201: { description: Device registered, returns device and token pair }
 *       422: { description: Validation failed }
 *       429: { description: Too many registrations from this network }
 */
deviceRoutes.post("/register", registerLimiter, validate(registerDeviceSchema), deviceController.register);

/**
 * @openapi
 * /api/v1/devices/refresh:
 *   post:
 *     tags: [Devices]
 *     summary: Swap a refresh token for a new token pair
 *     description: The refresh token is single-use. Re-using an old one revokes every token in its chain.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New token pair }
 *       401: { description: "REFRESH_INVALID, REFRESH_EXPIRED or REFRESH_REUSED — the app re-registers" }
 */
deviceRoutes.post("/refresh", refreshLimiter, validate(refreshTokenSchema), deviceController.refresh);

// Everything below needs a valid access token, then the per-device API limit.
deviceRoutes.use(authenticate, apiLimiter);

/**
 * @openapi
 * /api/v1/devices/me:
 *   get:
 *     tags: [Devices]
 *     summary: This device's profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Device }
 *       401: { description: Missing, invalid or expired access token }
 *   patch:
 *     tags: [Devices]
 *     summary: Update preferences
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               language: { type: string, enum: [en, pcm, ha, yo, ig] }
 *     responses:
 *       200: { description: Updated device }
 *   delete:
 *     tags: [Devices]
 *     summary: Delete my data (NDPA 2023)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Device and tokens deleted }
 */
deviceRoutes.get("/me", deviceController.getMe);
deviceRoutes.patch("/me", validate(updateDeviceSchema), deviceController.updateMe);
deviceRoutes.delete("/me", deviceController.deleteMe);

/**
 * @openapi
 * /api/v1/devices/me/elevate:
 *   post:
 *     tags: [Devices]
 *     summary: Unlock regulator mode with the PIN
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pin]
 *             properties:
 *               pin: { type: string, example: "246810" }
 *     responses:
 *       200: { description: New token pair with the regulator role }
 *       403: { description: INVALID_PIN }
 *       429: { description: Too many PIN attempts (5 per 15 minutes) }
 * /api/v1/devices/me/demote:
 *   post:
 *     tags: [Devices]
 *     summary: Leave regulator mode
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: New token pair with the public role }
 */
deviceRoutes.post("/me/elevate", pinLimiter, validate(elevateDeviceSchema), deviceController.elevate);
deviceRoutes.post("/me/demote", deviceController.demote);
