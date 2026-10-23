import type { NextFunction, Request, Response } from "express";
import { httpRequestDurationSeconds, httpRequestsTotal } from "../lib/metrics.js";

/**
 * Records count and duration for every request. The route label uses the
 * route pattern (/scans/:id), never the raw URL (/scans/8f3a…) — one label
 * per id would explode the number of time series (cardinality explosion).
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stopTimer = httpRequestDurationSeconds.startTimer();

  res.on("finish", () => {
    const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : "unmatched";
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
  });

  next();
}
