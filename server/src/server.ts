import type { Server } from "node:http";
import type { Worker } from "bullmq";
import { llmService } from "./ai/llm.service.js";
import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { scanProgress } from "./lib/scanProgress.js";
import { closeHotspotQueue } from "./queues/hotspot.queue.js";
import { closeQueues } from "./queues/scan.queue.js";
import { registerHotspotTrigger, startHotspotWorker } from "./workers/hotspot.worker.js";
import { startScanWorker } from "./workers/scan.worker.js";

let server: Server | undefined;
let workers: Worker[] = [];

async function start(): Promise<void> {
  // Fail fast: don't accept traffic until both dependencies really answer.
  // ($connect() alone proves nothing: the driver adapter connects lazily.)
  await prisma.$queryRaw`SELECT 1`;
  logger.info({ event: "db:connected" }, "Database connected");
  // The rate limiters already touched Redis at load, which started the lazy
  // connection; PING waits for it (and fails if Redis is down).
  await redis.ping();

  const providers = await llmService.status();
  if (providers.length === 0) {
    logger.warn({ event: "ai:not-configured" }, "No AI provider key set — photo scans are disabled (manual checks still work)");
  } else {
    logger.info({ event: "ai:providers", chain: providers.map((p) => `${p.name}:${p.models.vision}`) }, "AI provider chain ready");
  }

  // Flagged manual checks happen here, so this process always asks for hotspot refreshes.
  registerHotspotTrigger();
  if (config.SCAN_WORKER_ENABLED) workers = [startScanWorker(), await startHotspotWorker()];

  server = createApp().listen(config.PORT, () => {
    logger.info(
      { event: "server:started", port: config.PORT, environment: config.NODE_ENV },
      `Server listening on http://localhost:${config.PORT}`
    );
  });
}

/** Stop taking requests, let in-flight ones and running scan jobs finish, then close connections. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ event: "server:stopping", signal }, "Shutting down");
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  await new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
    // Open SSE streams never end on their own; cut them after a short grace period.
    setTimeout(() => server?.closeAllConnections(), 3_000).unref();
  });
  await Promise.allSettled(workers.map((worker) => worker.close()));
  llmService.shutdown();
  await Promise.allSettled([closeQueues(), closeHotspotQueue(), scanProgress.close(), prisma.$disconnect(), redis.quit()]);
  logger.info({ event: "server:stopped" }, "Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error({ event: "process:unhandled-rejection", reason: String(reason) }, "Unhandled promise rejection");
});

start().catch((err: unknown) => {
  logger.fatal(
    { event: "server:start-failed", message: err instanceof Error ? err.message : String(err) },
    "Server failed to start — is Docker running? (npm run db:up)"
  );
  process.exit(1);
});
