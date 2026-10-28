import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Prometheus metrics, exposed at GET /metrics.
 * Counter = only goes up · Gauge = goes up and down · Histogram = distribution.
 */
export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ app: "medverify-api" });
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "HTTP requests handled",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const rateLimitedTotal = new Counter({
  name: "rate_limited_requests_total",
  help: "Requests rejected by a rate limiter",
  labelNames: ["limiter"] as const,
  registers: [metricsRegistry],
});

export const scansTotal = new Counter({
  name: "scans_total",
  help: "Completed verifications, by kind and verdict",
  labelNames: ["kind", "verdict"] as const,
  registers: [metricsRegistry],
});

export const securityEventsTotal = new Counter({
  name: "security_events_total",
  help: "Security-relevant events (failed PINs, refresh token reuse)",
  labelNames: ["event"] as const,
  registers: [metricsRegistry],
});
