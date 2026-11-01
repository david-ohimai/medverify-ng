import { llmService } from "../../ai/llm.service.js";
import { distanceMetres, nearestAreaName } from "../../lib/areas.js";
import { appEvents } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import type { PaginationMeta } from "../../lib/response.js";
import { hotspotRepository, type ClusterRow, type HotspotData } from "../../repositories/hotspot.repository.js";
import { registryService } from "../registry.service.js";
import { alertFacts, hasGrown, matchClusters, severityFor, templateAlert, type AlertFacts } from "./hotspotRules.js";
import type { HotspotSeverity } from "../../generated/prisma/enums.js";

/** Hotspots look at the last 7 days of flagged scans. */
export const HOTSPOT_WINDOW_HOURS = 7 * 24;

export const STATS_WINDOWS = { "24h": 24, "7d": 7 * 24, "30d": 30 * 24 } as const;
export type StatsWindow = keyof typeof STATS_WINDOWS;

export interface RefreshSummary {
  clusters: number;
  appeared: number;
  continued: number;
  resolved: number;
  alerts: number;
}

/** The registered product behind each cluster's NAFDAC number (cached registry lookups). */
async function registeredProducts(numbers: string[]) {
  const entries = await Promise.all(numbers.map(async (nafdacNo) => [nafdacNo, await registryService.findProduct(nafdacNo)] as const));
  return new Map(entries);
}

/** The AI writes the card from the facts alone; if no provider can, a template does. */
async function writeAlert(hotspotId: string, facts: AlertFacts, severity: HotspotSeverity): Promise<void> {
  let card: { title: string; body: string; recommendedAction: string };
  let generatedBy = "template";
  let promptVersion: number | null = null;
  try {
    const result = await llmService.run(
      "alert_summary",
      [{ type: "text", text: `Cluster facts:\n${JSON.stringify(facts, null, 2)}` }],
      { inputSummary: `hotspot ${hotspotId}: ${facts.flagged_scans} flagged scans, ${facts.nafdac_no ?? "?"}, ${facts.area ?? "unnamed area"}` }
    );
    card = { title: result.data.title, body: result.data.body, recommendedAction: result.data.recommended_action };
    generatedBy = result.provider;
    promptVersion = result.promptVersion;
  } catch (err) {
    logger.warn({ event: "hotspot:alert-template", hotspotId, message: (err as Error).message }, "AI alert unavailable; using the template");
    card = templateAlert(facts);
  }

  const alert = await hotspotRepository.createAlert({
    hotspotId,
    ...card,
    severity,
    generatedBy,
    promptVersion,
    facts: facts as unknown as object,
  });
  appEvents.emit("hotspot:alert-created", { alertId: alert.id, hotspotId, severity, generatedBy });
}

export const hotspotService = {
  /**
   * The repeatable job: cluster the last 7 days of flagged scans, carry each
   * cluster over to the hotspot it continues, open new ones, close the ones
   * that faded, and write an alert for every hotspot that appeared or grew.
   */
  async refresh(): Promise<RefreshSummary> {
    const [clusters, stored] = await Promise.all([
      hotspotRepository.computeClusters(HOTSPOT_WINDOW_HOURS),
      hotspotRepository.listActive(),
    ]);
    const match = matchClusters(clusters, stored);
    const products = await registeredProducts([...new Set(clusters.map((c) => c.nafdacNo).filter((no): no is string => no !== null))]);
    const productOf = (cluster: ClusterRow) => (cluster.nafdacNo ? (products.get(cluster.nafdacNo) ?? null) : null);

    const toData = (cluster: ClusterRow): HotspotData => ({
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      radiusM: cluster.radiusM,
      scanCount: cluster.scanCount,
      highRiskCount: cluster.highRiskCount,
      maxRiskScore: cluster.maxRiskScore,
      recallInvolved: cluster.recallInvolved,
      severity: severityFor(cluster),
      productId: productOf(cluster)?.id ?? null,
      nafdacNo: cluster.nafdacNo,
      batchNo: cluster.batchNo,
      areaName: nearestAreaName(cluster.latitude, cluster.longitude),
      simulatedShare: cluster.simulatedShare,
      firstSeen: cluster.firstSeen,
      lastSeen: cluster.lastSeen,
    });
    const factsFor = (cluster: ClusterRow, data: HotspotData) =>
      alertFacts(cluster, {
        severity: data.severity,
        areaName: data.areaName,
        registeredProduct: (() => {
          const product = productOf(cluster);
          return product ? `${product.brandName} (${product.genericName})` : null;
        })(),
      });

    let alerts = 0;
    for (const cluster of match.appeared) {
      const data = toData(cluster);
      const hotspot = await hotspotRepository.create(data);
      await writeAlert(hotspot.id, factsFor(cluster, data), data.severity);
      alerts++;
    }
    for (const { cluster, hotspot } of match.continued) {
      const data = toData(cluster);
      await hotspotRepository.update(hotspot.id, data);
      if (hasGrown(hotspot, data)) {
        await writeAlert(hotspot.id, factsFor(cluster, data), data.severity);
        alerts++;
      }
    }
    if (match.gone.length > 0) await hotspotRepository.deactivate(match.gone.map((hotspot) => hotspot.id));

    const summary = {
      clusters: clusters.length,
      appeared: match.appeared.length,
      continued: match.continued.length,
      resolved: match.gone.length,
      alerts,
    };
    logger.info({ event: "hotspot:refreshed", ...summary }, "Hotspots refreshed");
    return summary;
  },

  /** Regulator map: active hotspots with their latest alert. Coordinates are cluster centres, not scans. */
  async listActive() {
    const hotspots = await hotspotRepository.listActiveWithAlert();
    return hotspots.map(({ alerts, ...hotspot }) => ({
      ...hotspot,
      includesSimulatedData: hotspot.simulatedShare > 0,
      latestAlert: alerts[0] ?? null,
    }));
  },

  async listAlerts(page: number, limit: number) {
    const { items, total } = await hotspotRepository.listAlerts(page, limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const meta: PaginationMeta = { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
    return { items, meta };
  },

  async stats(window: StatsWindow) {
    const hours = STATS_WINDOWS[window];
    const [stats, active] = await Promise.all([hotspotRepository.stats(hours), hotspotRepository.listActive()]);
    return {
      window,
      ...stats,
      activeHotspots: active.length,
      highSeverityHotspots: active.filter((hotspot) => hotspot.severity === "high").length,
      includesSimulatedData: stats.simulated > 0,
    };
  },

  /**
   * Public view for the app: medium/high hotspots within `radiusKm`, with
   * the product, batch and area, enough to warn, nothing about individual scans.
   */
  async nearby(latitude: number, longitude: number, radiusKm: number) {
    const hotspots = await hotspotRepository.listActiveWithAlert();
    return hotspots
      .filter((hotspot) => hotspot.severity !== "low")
      .map((hotspot) => ({
        hotspot,
        distanceKm: Math.round(distanceMetres(latitude, longitude, hotspot.latitude, hotspot.longitude) / 100) / 10,
      }))
      .filter(({ distanceKm }) => distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map(({ hotspot, distanceKm }) => ({
        id: hotspot.id,
        areaName: hotspot.areaName,
        distanceKm,
        severity: hotspot.severity,
        product: hotspot.product ? { nafdacNo: hotspot.product.nafdacNo, brandName: hotspot.product.brandName, source: hotspot.product.source } : null,
        nafdacNo: hotspot.nafdacNo,
        batchNo: hotspot.batchNo,
        recallInvolved: hotspot.recallInvolved,
        title: hotspot.alerts[0]?.title ?? null,
        lastSeen: hotspot.lastSeen,
        includesSimulatedData: hotspot.simulatedShare > 0,
      }));
  },
};
