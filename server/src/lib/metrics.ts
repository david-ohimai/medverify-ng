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

export const aiCallsTotal = new Counter({
  name: "ai_calls_total",
  help: "AI provider calls, by provider, task and outcome (ok or an error code)",
  labelNames: ["provider", "task", "outcome", "fallback"] as const,
  registers: [metricsRegistry],
});

export const aiCallDurationSeconds = new Histogram({
  name: "ai_call_duration_seconds",
  help: "AI provider call duration in seconds, including retries",
  labelNames: ["provider", "task"] as const,
  buckets: [0.5, 1, 2, 4, 8, 15, 30, 60],
  registers: [metricsRegistry],
});

export const aiTokensTotal = new Counter({
  name: "ai_tokens_total",
  help: "Tokens used, by provider and direction (input/output)",
  labelNames: ["provider", "direction"] as const,
  registers: [metricsRegistry],
});

export const scanJobsTotal = new Counter({
  name: "scan_jobs_total",
  help: "Photo scan jobs by outcome (done, failed, dead_lettered)",
  labelNames: ["outcome"] as const,
  registers: [metricsRegistry],
});

export const hotspotAlertsTotal = new Counter({
  name: "hotspot_alerts_total",
  help: "Hotspot alerts written, by severity and author (gemini / openrouter / template)",
  labelNames: ["severity", "generated_by"] as const,
  registers: [metricsRegistry],
});

export const securityEventsTotal = new Counter({
  name: "security_events_total",
  help: "Security-relevant events (failed PINs, refresh token reuse)",
  labelNames: ["event"] as const,
  registers: [metricsRegistry],
});
