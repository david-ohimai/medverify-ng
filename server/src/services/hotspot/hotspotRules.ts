import type { HotspotSeverity } from "../../generated/prisma/enums.js";
import { distanceMetres } from "../../lib/areas.js";
import type { ClusterRow } from "../../repositories/hotspot.repository.js";

/**
 * The hotspot rules, as pure functions (no I/O, fully tested): how severe a
 * cluster is, which stored hotspot a new cluster continues, and when a
 * hotspot has changed enough to deserve a new alert.
 */

const SEVERITY_RANK: Record<HotspotSeverity, number> = { low: 0, medium: 1, high: 2 };

/**
 * high   — a recalled batch is involved, or ≥ 5 high-risk scans, or ≥ 10 flagged scans
 * medium — ≥ 5 flagged scans, or any high-risk scan / unregistered number in it
 * low    — anything else (3–4 suspicious scans)
 */
export function severityFor(cluster: Pick<ClusterRow, "recallInvolved" | "highRiskCount" | "scanCount" | "unregisteredCount" | "maxRiskScore">): HotspotSeverity {
  if (cluster.recallInvolved || cluster.highRiskCount >= 5 || cluster.scanCount >= 10) return "high";
  if (cluster.scanCount >= 5 || cluster.highRiskCount > 0 || cluster.unregisteredCount > 0 || cluster.maxRiskScore >= 65) return "medium";
  return "low";
}

/** A new cluster continues a stored hotspot if its centre is this close and it's about the same product. */
export const SAME_HOTSPOT_METRES = 3_000;

export interface StoredHotspot {
  id: string;
  latitude: number;
  longitude: number;
  nafdacNo: string | null;
  scanCount: number;
  severity: HotspotSeverity;
}

export interface ClusterMatch<C> {
  /** New cluster ↔ the stored hotspot it continues. */
  continued: Array<{ cluster: C; hotspot: StoredHotspot }>;
  appeared: C[];
  /** Stored hotspots no cluster continues any more. */
  gone: StoredHotspot[];
}

/**
 * DBSCAN numbers clusters afresh on every run, so continuity comes from
 * geography: each cluster is paired with the nearest unclaimed stored
 * hotspot within 3 km about the same NAFDAC number. Largest clusters claim first.
 */
export function matchClusters<C extends Pick<ClusterRow, "latitude" | "longitude" | "nafdacNo" | "scanCount">>(
  clusters: readonly C[],
  stored: readonly StoredHotspot[]
): ClusterMatch<C> {
  const unclaimed = new Set(stored);
  const result: ClusterMatch<C> = { continued: [], appeared: [], gone: [] };

  for (const cluster of [...clusters].sort((a, b) => b.scanCount - a.scanCount)) {
    let best: { hotspot: StoredHotspot; distance: number } | null = null;
    for (const hotspot of unclaimed) {
      if (hotspot.nafdacNo !== cluster.nafdacNo) continue;
      const distance = distanceMetres(cluster.latitude, cluster.longitude, hotspot.latitude, hotspot.longitude);
      if (distance <= SAME_HOTSPOT_METRES && (!best || distance < best.distance)) best = { hotspot, distance };
    }
    if (best) {
      unclaimed.delete(best.hotspot);
      result.continued.push({ cluster, hotspot: best.hotspot });
    } else {
      result.appeared.push(cluster);
    }
  }
  result.gone = [...unclaimed];
  return result;
}

/** Worth a fresh alert: it got more severe, or grew by half (and by at least 3 scans). */
export function hasGrown(previous: Pick<StoredHotspot, "scanCount" | "severity">, next: { scanCount: number; severity: HotspotSeverity }): boolean {
  if (SEVERITY_RANK[next.severity] > SEVERITY_RANK[previous.severity]) return true;
  const added = next.scanCount - previous.scanCount;
  return added >= 3 && added >= previous.scanCount / 2;
}

/** Everything the alert is written from — and the only thing the AI sees. */
export interface AlertFacts {
  area: string | null;
  /** The product registered under the number, or null if the number isn't registered. */
  registered_product: string | null;
  /** The name most of the scanned packs carried (may differ from the registered product). */
  name_on_packs: string | null;
  nafdac_no: string | null;
  batch_no: string | null;
  severity: HotspotSeverity;
  flagged_scans: number;
  high_risk_scans: number;
  unregistered_number_scans: number;
  number_on_wrong_product_scans: number;
  expired_scans: number;
  recalled_batch_involved: boolean;
  radius_km: number;
  first_seen: string;
  last_seen: string;
  simulated_share: number;
}

export function alertFacts(
  cluster: ClusterRow,
  details: { severity: HotspotSeverity; areaName: string | null; registeredProduct: string | null }
): AlertFacts {
  return {
    area: details.areaName,
    registered_product: details.registeredProduct,
    name_on_packs: cluster.packName,
    nafdac_no: cluster.nafdacNo,
    batch_no: cluster.batchNo,
    severity: details.severity,
    flagged_scans: cluster.scanCount,
    high_risk_scans: cluster.highRiskCount,
    unregistered_number_scans: cluster.unregisteredCount,
    number_on_wrong_product_scans: cluster.nameMismatchCount,
    expired_scans: cluster.expiredCount,
    recalled_batch_involved: cluster.recallInvolved,
    radius_km: Math.round(cluster.radiusM / 100) / 10,
    first_seen: cluster.firstSeen.toISOString().slice(0, 16).replace("T", " "),
    last_seen: cluster.lastSeen.toISOString().slice(0, 16).replace("T", " "),
    simulated_share: Math.round(cluster.simulatedShare * 100) / 100,
  };
}

/** The alert without AI — used when every provider is unavailable, so an alert is never missing. */
export function templateAlert(facts: AlertFacts): { title: string; body: string; recommendedAction: string } {
  const what = facts.registered_product ?? facts.name_on_packs ?? (facts.nafdac_no ? `NAFDAC ${facts.nafdac_no}` : "a medicine");
  const batch = facts.batch_no ? ` batch ${facts.batch_no}` : "";
  const where = facts.area ?? `an area about ${facts.radius_km} km across`;
  const reason = facts.recalled_batch_involved
    ? "a recalled batch"
    : facts.unregistered_number_scans > 0
      ? "an unregistered NAFDAC number"
      : facts.number_on_wrong_product_scans > 0
        ? "a registered number printed on the wrong product"
        : facts.expired_scans > 0
          ? "expired stock"
          : "packs that don't match the genuine product";
  return {
    title: `Suspected ${what}${batch} cluster near ${where}`.slice(0, 110),
    body:
      `${facts.flagged_scans} flagged scans of ${what}${batch} between ${facts.first_seen} and ${facts.last_seen} UTC; the main concern is ${reason}.` +
      (facts.simulated_share > 0 ? " (includes simulated pilot data)" : ""),
    recommendedAction: facts.recalled_batch_involved
      ? `Inspect sellers near ${where} for${batch || " the recalled batch"} and remove it from sale.`
      : `Inspect sellers near ${where} and collect samples of ${what} for testing.`,
  };
}
