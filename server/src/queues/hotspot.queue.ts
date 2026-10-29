import { Queue } from "bullmq";
import { logger } from "../lib/logger.js";
import { BULL_PREFIX, bullConnection } from "./scan.queue.js";

export const HOTSPOT_QUEUE = "hotspot-refresh";

/** Every 15 minutes, whatever happens. */
export const HOTSPOT_REFRESH_EVERY_MS = 15 * 60 * 1000;
/** After a flagged scan, refresh within 10 s — later scans in those 10 s ride along. */
const DEBOUNCE_MS = 10_000;
const DEBOUNCED_JOB_ID = "hotspot-refresh-debounced";

export interface HotspotJobData {
  reason: "schedule" | "flagged-scan" | "manual";
}

let queue: Queue<HotspotJobData> | undefined;

export function getHotspotQueue(): Queue<HotspotJobData> {
  queue ??= new Queue<HotspotJobData>(HOTSPOT_QUEUE, {
    connection: bullConnection(),
    prefix: BULL_PREFIX,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
  return queue;
}

/**
 * Registers the repeatable job. upsertJobScheduler is idempotent: every
 * process calling it at startup still yields one schedule in Redis.
 */
export async function scheduleHotspotRefresh(): Promise<void> {
  await getHotspotQueue().upsertJobScheduler(
    "hotspot-refresh-every-15-min",
    { every: HOTSPOT_REFRESH_EVERY_MS },
    { name: "refresh", data: { reason: "schedule" } }
  );
}

/**
 * Debounced refresh after a flagged scan: a fixed job id means that while
 * one refresh is waiting, further requests are ignored by BullMQ — a burst
 * of 50 suspicious scans costs one clustering run, not 50.
 */
export async function requestHotspotRefresh(reason: HotspotJobData["reason"] = "flagged-scan"): Promise<void> {
  try {
    // A regulator's "refresh now" runs at once; automatic requests share the debounced job.
    const options =
      reason === "manual"
        ? {}
        : { jobId: DEBOUNCED_JOB_ID, delay: DEBOUNCE_MS, removeOnComplete: true, removeOnFail: true };
    await getHotspotQueue().add("refresh", { reason }, options);
  } catch (err) {
    logger.warn({ event: "hotspot:request-failed", message: (err as Error).message }, "Could not queue a hotspot refresh");
  }
}

export async function closeHotspotQueue(): Promise<void> {
  await queue?.close();
}
