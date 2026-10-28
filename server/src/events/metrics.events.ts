import { scansTotal } from "../lib/metrics.js";
import { listen } from "./listen.js";

/** Business metrics for /metrics, fed by events so services don't import prom-client. */
listen("scan:completed", "metrics", ({ kind, verdict }) => {
  scansTotal.inc({ kind, verdict });
});
