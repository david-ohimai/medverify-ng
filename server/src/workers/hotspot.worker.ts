import { Worker } from "bullmq";
import { listen } from "../events/listen.js";
import { logger } from "../lib/logger.js";
import { runWithContext } from "../lib/requestContext.js";
import { RISK_BANDS } from "../services/risk/riskScorer.js";
import { BULL_PREFIX, bullConnection } from "../queues/scan.queue.js";
import { HOTSPOT_QUEUE, requestHotspotRefresh, scheduleHotspotRefresh, type HotspotJobData } from "../queues/hotspot.queue.js";
import { hotspotService } from "../services/hotspot/hotspot.service.js";

/**
 * Hotspot clustering off the request path: a repeatable job every 15 minutes
 * plus a debounced run after flagged scans. Concurrency 1 — two clustering
 * runs at once would race to open the same hotspot twice.
 */
export async function startHotspotWorker(): Promise<Worker<HotspotJobData>> {
  const worker = new Worker<HotspotJobData>(
    HOTSPOT_QUEUE,
    (job) => runWithContext({ correlationId: `hotspot-${job.id}` }, () => hotspotService.refresh()),
    { connection: bullConnection(), prefix: BULL_PREFIX, concurrency: 1 }
  );
  worker.on("failed", (job, err) => {
    logger.warn({ event: "hotspot-job:failed", jobId: job?.id, message: err.message }, "Hotspot refresh failed");
  });
  worker.on("error", (err) => logger.error({ event: "hotspot-worker:error", message: err.message }, "Hotspot worker error"));

  await scheduleHotspotRefresh();
  logger.info({ event: "hotspot-worker:started" }, "Hotspot worker started (every 15 min + after flagged scans)");
  return worker;
}

let triggerRegistered = false;

/**
 * A flagged scan (risk ≥ 30) asks for a debounced refresh. Registered by the
 * processes that run jobs (server.ts, worker.ts) — not by the app itself, so
 * tests never touch the queue.
 */
export function registerHotspotTrigger(): void {
  if (triggerRegistered) return;
  triggerRegistered = true;
  listen("scan:completed", "hotspot-trigger", ({ riskScore }) =>
    riskScore >= RISK_BANDS.suspicious ? requestHotspotRefresh("flagged-scan") : undefined
  );
}
