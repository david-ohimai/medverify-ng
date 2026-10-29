import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { runWithContext } from "../lib/requestContext.js";
import { scanJobsTotal } from "../lib/metrics.js";
import { BULL_PREFIX, bullConnection, getDeadLetterQueue, SCAN_QUEUE, type ScanJobData } from "../queues/scan.queue.js";
import { scanRepository } from "../repositories/scan.repository.js";
import { photoScanService } from "../services/photoScan.service.js";

/** Free-tier AI is rate-limited per minute; a few scans at a time is plenty. */
const CONCURRENCY = 3;

async function processJob(job: Job<ScanJobData>): Promise<void> {
  const correlationId = job.data.correlationId ?? `job-${job.id}`;
  await runWithContext({ correlationId }, () => photoScanService.process(job.data.scanId));
}

/** Last attempt failed: fail the scan with a clear reason and park the job in the dead-letter queue. */
async function onFinalFailure(job: Job<ScanJobData>, err: Error): Promise<void> {
  const { scanId } = job.data;
  const scan = await scanRepository.findForWorker(scanId);
  await photoScanService.fail(scanId, scan?.deviceId ?? null, photoScanService.failureCodeFor(err));
  await getDeadLetterQueue().add("dead-letter", { ...job.data, failedReason: err.message.slice(0, 500), attemptsMade: job.attemptsMade });
  scanJobsTotal.inc({ outcome: "dead_lettered" });
}

/**
 * Runs the scan pipeline off the request path. In development it lives in
 * the API process (SCAN_WORKER_ENABLED=true); in production it can run on
 * its own with `npm run worker` and scale separately.
 */
export function startScanWorker(): Worker<ScanJobData> {
  const worker = new Worker<ScanJobData>(SCAN_QUEUE, processJob, {
    connection: bullConnection(),
    prefix: BULL_PREFIX,
    concurrency: CONCURRENCY,
  });

  worker.on("failed", (job, err) => {
    if (!job) return;
    const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.warn(
      { event: "scan-job:failed", scanId: job.data.scanId, attempt: job.attemptsMade, finalAttempt, message: err.message },
      finalAttempt ? "Scan job failed for good" : "Scan job failed; will retry"
    );
    if (finalAttempt) {
      void runWithContext({ correlationId: job.data.correlationId ?? `job-${job.id}` }, () => onFinalFailure(job, err)).catch(
        (failure: unknown) =>
          logger.error({ event: "scan-job:dead-letter-failed", scanId: job.data.scanId, message: String(failure) }, "Dead-letter handling failed")
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ event: "scan-worker:error", message: err.message }, "Scan worker error");
  });

  logger.info({ event: "scan-worker:started", concurrency: CONCURRENCY }, "Scan worker started");
  return worker;
}
