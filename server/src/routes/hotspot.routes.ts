import { Router } from "express";
import { hotspotController } from "../controllers/hotspot.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { hotspotAlertsSchema, hotspotStatsSchema, nearbyAlertsSchema } from "../validators/hotspot.validator.js";

/** Regulator map: hotspots, alerts, stats. */
export const hotspotRoutes = Router();
/** Public: warnings near the user. */
export const alertRoutes = Router();

hotspotRoutes.use(authenticate, authorize("regulator"), apiLimiter);
alertRoutes.use(authenticate, apiLimiter);

/**
 * @openapi
 * /api/v1/hotspots:
 *   get:
 *     tags: [Hotspots]
 *     summary: Active hotspots — clusters of suspicious scans in the last 7 days (PostGIS ST_ClusterDBSCAN)
 *     description: |
 *       Each has a centre (cluster centroid, not a scan), radius, counts, severity, the product and batch
 *       most scans were about, the nearest market, `includesSimulatedData`, and its latest AI-written alert.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Hotspots, most severe first" }
 *       403: { description: Needs regulator mode }
 * /api/v1/hotspots/alerts:
 *   get:
 *     tags: [Hotspots]
 *     summary: Alert cards, newest first (written by the AI from cluster facts, or a template)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: Alerts with pagination meta }
 * /api/v1/hotspots/stats:
 *   get:
 *     tags: [Hotspots]
 *     summary: Map stat cards — scans, flagged, high risk, unregistered, active hotspots, top flagged products
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: window, schema: { type: string, enum: [24h, 7d, 30d], default: 7d } }
 *     responses:
 *       200: { description: Stats }
 * /api/v1/hotspots/refresh:
 *   post:
 *     tags: [Hotspots]
 *     summary: Re-run the clustering now (it also runs every 15 minutes and after flagged scans)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       202: { description: Queued }
 */
hotspotRoutes.get("/", hotspotController.list);
hotspotRoutes.get("/alerts", validate(hotspotAlertsSchema), hotspotController.alerts);
hotspotRoutes.get("/stats", validate(hotspotStatsSchema), hotspotController.stats);
hotspotRoutes.post("/refresh", hotspotController.refresh);

/**
 * @openapi
 * /api/v1/alerts/nearby:
 *   get:
 *     tags: [Hotspots]
 *     summary: Warnings near the user — medium and high hotspots within radiusKm (any device)
 *     description: Product, batch, area and the alert title; nothing about individual scans.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: lat, required: true, schema: { type: number }, example: 6.4553 }
 *       - { in: query, name: lng, required: true, schema: { type: number }, example: 3.3881 }
 *       - { in: query, name: radiusKm, schema: { type: number, default: 25, maximum: 100 } }
 *     responses:
 *       200: { description: "Nearby alerts, closest first" }
 */
alertRoutes.get("/nearby", validate(nearbyAlertsSchema), hotspotController.nearby);
