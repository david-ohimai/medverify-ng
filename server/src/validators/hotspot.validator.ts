import { z } from "zod";
import { STATS_WINDOWS, type StatsWindow } from "../services/hotspot/hotspot.service.js";

export const hotspotStatsSchema = z.object({
  query: z.object({
    window: z.enum(Object.keys(STATS_WINDOWS) as [StatsWindow, ...StatsWindow[]]).default("7d"),
  }),
});
export type HotspotStatsQuery = z.infer<typeof hotspotStatsSchema>["query"];

export const hotspotAlertsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
export type HotspotAlertsQuery = z.infer<typeof hotspotAlertsSchema>["query"];

export const nearbyAlertsSchema = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce.number().min(1).max(100).default(25),
  }),
});
export type NearbyAlertsQuery = z.infer<typeof nearbyAlertsSchema>["query"];
