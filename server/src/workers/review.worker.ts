import { Queue, Worker } from "bullmq";
import { logger } from "../lib/logger.js";
import { runWithContext } from "../lib/requestContext.js";
import { BULL_PREFIX, bullConnection } from "../queues/scan.queue.js";
import { reviewService } from "../services/review/review.service.js";

export const REVIEW_QUEUE = "review-sla";
/** Often enough that a 4-hour SLA is never noticed late by more than a few minutes. */
export const REVIEW_SLA_EVERY_MS = 5 * 60 * 1000;

let queue: Queue | undefined;

/**
 * The review queue's SLA job, as a BullMQ job scheduler every 5 minutes:
 * escalate overdue reviews, return lapsed claims, delete photos past 7 days.
 */
export async function startReviewWorker(): Promise<Worker> {
  queue ??= new Queue(REVIEW_QUEUE, { connection: bullConnection(), prefix: BULL_PREFIX });
  await queue.upsertJobScheduler(
    "review-sla-every-5-min",
    { every: REVIEW_SLA_EVERY_MS },
    { name: "maintain", opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } } }
  );

  const worker = new Worker(REVIEW_QUEUE, (job) => runWithContext({ correlationId: `review-sla-${job.id}` }, () => reviewService.maintain()), {
    connection: bullConnection(),
    prefix: BULL_PREFIX,
    concurrency: 1,
  });
  worker.on("failed", (job, err) => logger.warn({ event: "review-sla:failed", jobId: job?.id, message: err.message }, "Review SLA job failed"));
  worker.on("error", (err) => logger.error({ event: "review-worker:error", message: err.message }, "Review worker error"));
  logger.info({ event: "review-worker:started" }, "Review SLA worker started (every 5 min)");
  return worker;
}

export async function closeReviewQueue(): Promise<void> {
  await queue?.close();
}
