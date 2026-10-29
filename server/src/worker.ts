import { llmService } from "./ai/llm.service.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { scanProgress } from "./lib/scanProgress.js";
import { closeQueues } from "./queues/scan.queue.js";
import { startScanWorker } from "./workers/scan.worker.js";
import "./events/index.js";

/**
 * Standalone scan worker, for running the pipeline separately from the API
 * (set SCAN_WORKER_ENABLED=false on the API then). `npm run worker`.
 */
async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  const worker = startScanWorker();

  const shutdown = async (signal: string) => {
    logger.info({ event: "worker:stopping", signal }, "Worker shutting down");
    // close() lets running jobs finish before returning.
    await worker.close();
    llmService.shutdown();
    await Promise.allSettled([closeQueues(), scanProgress.close(), prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  logger.fatal({ event: "worker:start-failed", message: err instanceof Error ? err.message : String(err) }, "Worker failed to start");
  process.exit(1);
});
