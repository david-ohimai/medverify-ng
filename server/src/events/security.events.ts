import { logger } from "../lib/logger.js";
import { securityEventsTotal } from "../lib/metrics.js";
import { listen } from "./listen.js";

/** Security signals: counted for /metrics and logged as warnings. */

listen("device:elevation-failed", "security", ({ deviceId }) => {
  securityEventsTotal.inc({ event: "pin_failed" });
  logger.warn({ event: "security:pin-failed", deviceId }, "Wrong regulator PIN");
});

listen("token:reuse-detected", "security", ({ deviceId, familyId }) => {
  securityEventsTotal.inc({ event: "refresh_reuse" });
  logger.warn({ event: "security:refresh-reuse", deviceId, familyId }, "Refresh token reused — token chain revoked");
});
