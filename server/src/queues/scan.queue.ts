import { Queue, type ConnectionOptions } from "bullmq";
import { config } from "../lib/config.js";
import { redis } from "../lib/redis.js";

export const SCAN_QUEUE = "scan-pipeline";
export const SCAN_DLQ = "scan-pipeline-dlq";
/** BullMQ manages its own key names; ioredis's keyPrefix must not be used with it. */
export const BULL_PREFIX = "medverify:bull";

export interface ScanJobData {
  scanId: string;
  /** Carried from the upload request so every log line and audit row of the scan shares it. */
  correlationId: string | null;
}

export interface DeadLetterData extends ScanJobData {
  failedReason: string;
  attemptsMade: number;
}

/**
 * BullMQ needs dedicated connections: blocking commands, and
 * maxRetriesPerRequest: null so a Redis blip pauses the worker instead of
 * failing jobs.
 */
export function bullConnection(): ConnectionOptions {
  return { url: config.REDIS_URL, maxRetriesPerRequest: null };
}

let scanQueue: Queue<ScanJobData> | undefined;
let deadLetterQueue: Queue<DeadLetterData> | undefined;

/** Created on first use, so importing the app (tests) never opens a connection. */
export function getScanQueue(): Queue<ScanJobData> {
  scanQueue ??= new Queue<ScanJobData>(SCAN_QUEUE, {
    connection: bullConnection(),
    prefix: BULL_PREFIX,
    defaultJobOptions: {
      // Transient failures (AI provider down, database blip) are retried with
      // growing gaps; a scan nobody can process ends in the dead-letter queue.
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  return scanQueue;
}

export function getDeadLetterQueue(): Queue<DeadLetterData> {
  deadLetterQueue ??= new Queue<DeadLetterData>(SCAN_DLQ, {
    connection: bullConnection(),
    prefix: BULL_PREFIX,
    defaultJobOptions: { removeOnComplete: true, removeOnFail: false },
  });
  return deadLetterQueue;
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([scanQueue?.close(), deadLetterQueue?.close()]);
}

/**
 * The uploaded photo waits in Redis only until the worker has read it — it
 * is never written to disk or a bucket. Short TTL: an unprocessed photo
 * disappears on its own.
 */
const IMAGE_TTL_SECONDS = 30 * 60;
const imageKey = (scanId: string) => `scan:image:${scanId}`;

export const scanImageStore = {
  async put(scanId: string, data: Buffer): Promise<void> {
    await redis.set(imageKey(scanId), data, "EX", IMAGE_TTL_SECONDS);
  },
  get(scanId: string): Promise<Buffer | null> {
    return redis.getBuffer(imageKey(scanId));
  },
  async remove(scanId: string): Promise<void> {
    await redis.del(imageKey(scanId));
  },
};
