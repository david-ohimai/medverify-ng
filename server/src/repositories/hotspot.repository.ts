import type { Prisma } from "../generated/prisma/client.js";
import type { HotspotSeverity } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

/** One cluster as PostGIS found it, before it is matched to a stored hotspot. */
export interface ClusterRow {
  latitude: number;
  longitude: number;
  radiusM: number;
  scanCount: number;
  highRiskCount: number;
  unregisteredCount: number;
  nameMismatchCount: number;
  expiredCount: number;
  maxRiskScore: number;
  recallInvolved: boolean;
  /** The NAFDAC number, batch and printed name most of the cluster's scans were about. */
  nafdacNo: string | null;
  batchNo: string | null;
  packName: string | null;
  simulatedShare: number;
  firstSeen: Date;
  lastSeen: Date;
}

/** Scans that count towards a hotspot: finished, flagged (risk ≥ 30), with a location. */
const FLAGGED_MIN_RISK = 30;

/**
 * Clustering parameters. eps is in metres on Web Mercator (EPSG:3857); at
 * Nigeria's latitudes (4–14° N) that overstates distances by only 0–3%.
 * minpoints 3: three suspicious scans within ~2 km of each other is a pattern.
 */
const CLUSTER_EPS_METRES = 2_000;
const CLUSTER_MIN_POINTS = 3;

export const hotspotSelect = {
  id: true,
  latitude: true,
  longitude: true,
  radiusM: true,
  scanCount: true,
  highRiskCount: true,
  maxRiskScore: true,
  recallInvolved: true,
  severity: true,
  nafdacNo: true,
  batchNo: true,
  areaName: true,
  simulatedShare: true,
  firstSeen: true,
  lastSeen: true,
  active: true,
  product: { select: { nafdacNo: true, brandName: true, genericName: true, source: true } },
} as const;

export type HotspotRecord = Prisma.HotspotGetPayload<{ select: typeof hotspotSelect }>;

export interface HotspotData {
  latitude: number;
  longitude: number;
  radiusM: number;
  scanCount: number;
  highRiskCount: number;
  maxRiskScore: number;
  recallInvolved: boolean;
  severity: HotspotSeverity;
  productId: string | null;
  nafdacNo: string | null;
  batchNo: string | null;
  areaName: string | null;
  simulatedShare: number;
  firstSeen: Date;
  lastSeen: Date;
}

export const hotspotRepository = {
  /**
   * ST_ClusterDBSCAN over the flagged scans of the last `hours`, then one
   * row of facts per cluster: centre, radius, counts, the product and batch
   * most scans were about, whether a recalled batch is involved.
   */
  computeClusters(hours: number) {
    return prisma.$queryRaw<ClusterRow[]>`
      WITH flagged AS (
        SELECT id, nafdac_no, batch_no, product_name, risk_score, verdict, signals, simulated, created_at,
               ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geom
        FROM scans
        WHERE status = 'done'
          AND risk_score >= ${FLAGGED_MIN_RISK}
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND created_at > now() - make_interval(hours => ${hours}::int)
      ),
      clustered AS (
        SELECT *, ST_ClusterDBSCAN(ST_Transform(geom, 3857), eps := ${CLUSTER_EPS_METRES}::float8, minpoints := ${CLUSTER_MIN_POINTS}::int)
                    OVER () AS cluster_id
        FROM flagged
      ),
      grouped AS (
        SELECT cluster_id, ST_Centroid(ST_Collect(geom)) AS centre FROM clustered
        WHERE cluster_id IS NOT NULL GROUP BY cluster_id
      )
      SELECT
        ST_Y(g.centre)::float8                                            AS latitude,
        ST_X(g.centre)::float8                                            AS longitude,
        COALESCE(MAX(ST_Distance(c.geom::geography, g.centre::geography)), 0)::int AS "radiusM",
        COUNT(*)::int                                                     AS "scanCount",
        COUNT(*) FILTER (WHERE c.verdict = 'high_risk')::int              AS "highRiskCount",
        COUNT(*) FILTER (WHERE c.verdict = 'unregistered')::int           AS "unregisteredCount",
        COUNT(*) FILTER (WHERE c.signals @> '[{"code":"NAME_MISMATCH"}]')::int AS "nameMismatchCount",
        COUNT(*) FILTER (WHERE c.signals @> '[{"code":"EXPIRED"}]')::int  AS "expiredCount",
        MAX(c.risk_score)::int                                            AS "maxRiskScore",
        BOOL_OR(c.signals @> '[{"code":"BATCH_RECALLED"}]')               AS "recallInvolved",
        MODE() WITHIN GROUP (ORDER BY c.nafdac_no)                        AS "nafdacNo",
        MODE() WITHIN GROUP (ORDER BY c.batch_no)                         AS "batchNo",
        MODE() WITHIN GROUP (ORDER BY c.product_name)                     AS "packName",
        AVG(CASE WHEN c.simulated THEN 1 ELSE 0 END)::float8              AS "simulatedShare",
        MIN(c.created_at)                                                 AS "firstSeen",
        MAX(c.created_at)                                                 AS "lastSeen"
      FROM clustered c JOIN grouped g USING (cluster_id)
      GROUP BY g.cluster_id, g.centre
      ORDER BY "scanCount" DESC`;
  },

  listActive() {
    return prisma.hotspot.findMany({ where: { active: true }, select: hotspotSelect });
  },

  /** Active hotspots, most severe and most recent first, each with its latest alert. */
  listActiveWithAlert() {
    return prisma.hotspot.findMany({
      where: { active: true },
      select: {
        ...hotspotSelect,
        alerts: {
          select: { id: true, title: true, body: true, recommendedAction: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ severity: "desc" }, { lastSeen: "desc" }],
    });
  },

  create(data: HotspotData) {
    return prisma.hotspot.create({ data, select: hotspotSelect });
  },

  update(id: string, data: HotspotData) {
    return prisma.hotspot.update({ where: { id }, data, select: hotspotSelect });
  },

  deactivate(ids: string[]) {
    return prisma.hotspot.updateMany({ where: { id: { in: ids } }, data: { active: false } });
  },

  createAlert(data: {
    hotspotId: string;
    title: string;
    body: string;
    recommendedAction: string;
    severity: HotspotSeverity;
    generatedBy: string;
    promptVersion: number | null;
    facts: Prisma.InputJsonValue;
  }) {
    return prisma.hotspotAlert.create({ data, select: { id: true } });
  },

  async listAlerts(page: number, limit: number) {
    const [items, total] = await Promise.all([
      prisma.hotspotAlert.findMany({
        select: {
          id: true,
          title: true,
          body: true,
          recommendedAction: true,
          severity: true,
          generatedBy: true,
          createdAt: true,
          hotspot: { select: { id: true, areaName: true, active: true, simulatedShare: true, latitude: true, longitude: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.hotspotAlert.count(),
    ]);
    return { items, total };
  },

  /** Headline numbers for the regulator map. */
  async stats(hours: number) {
    const [rows] = await prisma.$queryRaw<
      Array<{ scans: number; flagged: number; highRisk: number; unregistered: number; located: number; simulated: number }>
    >`
      SELECT COUNT(*)::int                                                AS scans,
             COUNT(*) FILTER (WHERE risk_score >= ${FLAGGED_MIN_RISK})::int AS flagged,
             COUNT(*) FILTER (WHERE verdict = 'high_risk')::int           AS "highRisk",
             COUNT(*) FILTER (WHERE verdict = 'unregistered')::int        AS unregistered,
             COUNT(*) FILTER (WHERE latitude IS NOT NULL)::int            AS located,
             COUNT(*) FILTER (WHERE simulated)::int                       AS simulated
      FROM scans
      WHERE status = 'done' AND created_at > now() - make_interval(hours => ${hours}::int)`;
    const topFlagged = await prisma.$queryRaw<Array<{ nafdacNo: string | null; productName: string | null; flagged: number }>>`
      SELECT s.nafdac_no AS "nafdacNo", COALESCE(p.brand_name, MAX(s.product_name)) AS "productName", COUNT(*)::int AS flagged
      FROM scans s LEFT JOIN products p ON p.id = s.product_id
      WHERE s.status = 'done' AND s.risk_score >= ${FLAGGED_MIN_RISK}
        AND s.created_at > now() - make_interval(hours => ${hours}::int)
      GROUP BY s.nafdac_no, p.brand_name
      ORDER BY flagged DESC
      LIMIT 5`;
    return { ...rows!, topFlagged };
  },
};
