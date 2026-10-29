import type { Request, Response } from "express";
import { sendSuccess } from "../lib/response.js";
import { requestHotspotRefresh } from "../queues/hotspot.queue.js";
import { hotspotService } from "../services/hotspot/hotspot.service.js";
import type { HotspotAlertsQuery, HotspotStatsQuery, NearbyAlertsQuery } from "../validators/hotspot.validator.js";

export const hotspotController = {
  async list(_req: Request, res: Response): Promise<void> {
    const hotspots = await hotspotService.listActive();
    sendSuccess(res, 200, `${hotspots.length} active hotspot(s)`, hotspots);
  },

  async alerts(req: Request, res: Response): Promise<void> {
    const { page, limit } = req.validated.query as HotspotAlertsQuery;
    const { items, meta } = await hotspotService.listAlerts(page, limit);
    sendSuccess(res, 200, "Hotspot alerts", items, meta);
  },

  async stats(req: Request, res: Response): Promise<void> {
    const { window } = req.validated.query as HotspotStatsQuery;
    sendSuccess(res, 200, "Hotspot stats", await hotspotService.stats(window));
  },

  async refresh(_req: Request, res: Response): Promise<void> {
    await requestHotspotRefresh("manual");
    sendSuccess(res, 202, "Hotspot refresh queued", { queued: true });
  },

  async nearby(req: Request, res: Response): Promise<void> {
    const { lat, lng, radiusKm } = req.validated.query as NearbyAlertsQuery;
    const alerts = await hotspotService.nearby(lat, lng, radiusKm);
    sendSuccess(res, 200, `${alerts.length} alert(s) near you`, alerts);
  },
};
