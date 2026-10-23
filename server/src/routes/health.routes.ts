import { Router } from "express";
import { config } from "../lib/config.js";
import { secureEquals } from "../lib/hash.js";
import { metricsRegistry } from "../lib/metrics.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

export const healthRoutes = Router();

const CHECK_TIMEOUT_MS = 2000;

async function check(name: string, probe: () => Promise<unknown>): Promise<{ name: string; ok: boolean; ms: number; error?: string }> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), CHECK_TIMEOUT_MS);
      }),
    ]);
    return { name, ok: true, ms: Date.now() - started };
  } catch (err) {
    return { name, ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : "failed" };
  } finally {
    // The probe usually wins; don't leave the timeout running for 2 s after every poll.
    clearTimeout(timer);
  }
}

/**
 * @openapi
 * /health/live:
 *   get:
 *     tags: [Health]
 *     summary: Liveness — the process is up
 *     responses:
 *       200: { description: Alive }
 */
healthRoutes.get(["/health", "/health/live"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()), environment: config.NODE_ENV });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness — the database and Redis both answer
 *     responses:
 *       200: { description: Ready to serve traffic }
 *       503: { description: A dependency is down }
 */
healthRoutes.get("/health/ready", async (_req, res) => {
  const checks = await Promise.all([
    check("database", () => prisma.$queryRaw`SELECT 1`),
    check("redis", () => redis.ping()),
  ]);
  const ready = checks.every((c) => c.ok);
  res.setHeader("Cache-Control", "no-store");
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable", checks });
});

/** Prometheus scrape endpoint. Protected by METRICS_TOKEN when one is set. */
healthRoutes.get("/metrics", async (req, res) => {
  if (config.METRICS_TOKEN) {
    const presented = req.headers.authorization?.replace(/^Bearer\s+/, "") ?? "";
    if (!secureEquals(presented, config.METRICS_TOKEN)) {
      res.status(401).end();
      return;
    }
  }
  res.setHeader("Content-Type", metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});
