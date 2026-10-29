import { getCorrelationId } from "../lib/requestContext.js";
import { aiAuditLogRepository } from "../repositories/aiAuditLog.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { listen } from "./listen.js";

/**
 * Writes the audit trail. Services only emit events; deciding what gets
 * audited lives here, so adding or removing an audit entry never touches
 * business logic.
 */
function audit(
  action: string,
  deviceId: string | null,
  meta: Record<string, unknown> = {},
  entityId?: string,
  entity = "device"
) {
  const correlationId = getCorrelationId();
  return auditLogRepository.create({
    deviceId,
    action,
    entity,
    ...(entityId ? { entityId } : {}),
    meta: meta as never,
    ...(correlationId ? { correlationId } : {}),
  });
}

listen("device:registered", "audit", ({ deviceId, isNew, platform, appVersion }) =>
  audit("device.registered", deviceId, { isNew, platform, appVersion })
);

listen("device:elevated", "audit", ({ deviceId }) => audit("device.elevated", deviceId));

listen("device:elevation-failed", "audit", ({ deviceId }) => audit("device.elevation_failed", deviceId));

listen("device:demoted", "audit", ({ deviceId }) => audit("device.demoted", deviceId));

listen("device:preferences-updated", "audit", ({ deviceId, changes }) =>
  audit("device.preferences_updated", deviceId, changes)
);

// The device row is already gone, so keep its id in entity_id instead of the foreign key.
listen("device:deleted", "audit", ({ deviceId }) => audit("device.deleted", null, {}, deviceId));

listen("token:reuse-detected", "audit", ({ deviceId, familyId }) =>
  audit("token.reuse_detected", deviceId, { familyId })
);

listen("scan:completed", "audit", ({ scanId, deviceId, kind, verdict, riskScore }) =>
  audit("scan.completed", deviceId, { kind, verdict, riskScore }, scanId, "scan")
);

listen("scan:queued", "audit", ({ scanId, deviceId }) => audit("scan.queued", deviceId, {}, scanId, "scan"));

listen("scan:failed", "audit", ({ scanId, deviceId, failureCode }) =>
  audit("scan.failed", deviceId, { failureCode }, scanId, "scan")
);

listen("assistant:answered", "audit", ({ conversationId, deviceId, rounds, tools, provider }) =>
  audit("assistant.answered", deviceId, { rounds, tools, provider }, conversationId, "conversation")
);

listen("assistant:injection-suspected", "audit", ({ deviceId, conversationId }) =>
  audit("assistant.injection_suspected", deviceId, {}, conversationId, "conversation")
);

listen("hotspot:alert-created", "audit", ({ alertId, hotspotId, severity, generatedBy }) =>
  audit("hotspot.alert_created", null, { hotspotId, severity, generatedBy }, alertId, "hotspot_alert")
);

// The model control plane's record: one row per AI call (ai_audit_logs).
listen("ai:called", "ai-audit", (call) => aiAuditLogRepository.create({ ...call, correlationId: getCorrelationId() ?? null }));
