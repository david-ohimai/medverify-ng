import type { Server } from "node:http";
import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";

let server: Server | undefined;

async function start(): Promise<void> {
  // Fail fast: don't accept traffic until both dependencies really answer.
  // ($connect() alone proves nothing: the driver adapter connects lazily.)
  await prisma.$queryRaw`SELECT 1`;
  logger.info({ event: "db:connected" }, "Database connected");
  // The rate limiters already touched Redis at load, which started the lazy
  // connection; PING waits for it (and fails if Redis is down).
  await redis.ping();

  server = createApp().listen(config.PORT, () => {
    logger.info(
      { event: "server:started", port: config.PORT, environment: config.NODE_ENV },
      `Server listening on http://localhost:${config.PORT}`
    );
  });
}

/** Stop taking requests, let in-flight ones finish, then close connections. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ event: "server:stopping", signal }, "Shutting down");
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
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
