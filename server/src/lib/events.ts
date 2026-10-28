import { EventEmitter } from "node:events";
import type { DevicePlatform, ScanKind, Verdict } from "../generated/prisma/enums.js";

/**
 * Every event the app emits, with its payload. Services emit; listeners in
 * src/events/ react (audit log, metrics). Services stay free of side effects
 * they don't own, and a failing listener can never break the request.
 */
export interface AppEvents {
  "device:registered": [{ deviceId: string; isNew: boolean; platform: DevicePlatform; appVersion: string }];
  "device:elevated": [{ deviceId: string }];
  "device:elevation-failed": [{ deviceId: string }];
  "device:demoted": [{ deviceId: string }];
  "device:deleted": [{ deviceId: string }];
  "device:preferences-updated": [{ deviceId: string; changes: Record<string, unknown> }];
  "token:refreshed": [{ deviceId: string }];
  "token:reuse-detected": [{ deviceId: string; familyId: string }];
  "scan:completed": [{ scanId: string; deviceId: string; kind: ScanKind; verdict: Verdict; riskScore: number }];
}

export type AppEventName = keyof AppEvents;
export type AppEventPayload<E extends AppEventName> = AppEvents[E][0];

export const appEvents = new EventEmitter<AppEvents>();

/** Keep listener mistakes from becoming silent leaks. */
appEvents.setMaxListeners(20);
