import {
  aiCallDurationSeconds,
  aiCallsTotal,
  aiTokensTotal,
  assistantAnswersTotal,
  assistantToolCallsTotal,
  hotspotAlertsTotal,
  scanJobsTotal,
  scansTotal,
} from "../lib/metrics.js";
import { listen } from "./listen.js";

/** Business metrics for /metrics, fed by events so services don't import prom-client. */
listen("scan:completed", "metrics", ({ kind, verdict }) => {
  scansTotal.inc({ kind, verdict });
  if (kind === "photo") scanJobsTotal.inc({ outcome: "done" });
});

listen("scan:failed", "metrics", () => {
  scanJobsTotal.inc({ outcome: "failed" });
});

listen("hotspot:alert-created", "metrics", ({ severity, generatedBy }) => {
  hotspotAlertsTotal.inc({ severity, generated_by: generatedBy });
});

listen("assistant:answered", "metrics", ({ rounds, provider }) => {
  assistantAnswersTotal.inc({ rounds: String(rounds), provider });
});

listen("assistant:tool-called", "metrics", ({ tool, ok }) => {
  assistantToolCallsTotal.inc({ tool, ok: String(ok) });
});

listen("ai:called", "metrics", ({ provider, task, success, errorCode, fallbackUsed, latencyMs, inputTokens, outputTokens }) => {
  aiCallsTotal.inc({ provider, task, outcome: success ? "ok" : (errorCode ?? "error"), fallback: String(fallbackUsed) });
  aiCallDurationSeconds.observe({ provider, task }, latencyMs / 1000);
  if (inputTokens) aiTokensTotal.inc({ provider, direction: "input" }, inputTokens);
  if (outputTokens) aiTokensTotal.inc({ provider, direction: "output" }, outputTokens);
});
