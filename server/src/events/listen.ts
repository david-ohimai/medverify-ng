import { appEvents, type AppEventName, type AppEventPayload } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { scrubSensitive } from "../lib/scrub.js";

/**
 * Registers a listener that can never break the request that emitted the
 * event: sync throws and async rejections are caught and logged.
 */
export function listen<E extends AppEventName>(
  event: E,
  name: string,
  handler: (payload: AppEventPayload<E>) => unknown | Promise<unknown>
): void {
  const wrapped = (payload: AppEventPayload<E>) => {
    try {
      void Promise.resolve(handler(payload)).catch((err: unknown) => logFailure(event, name, err));
    } catch (err) {
      logFailure(event, name, err);
    }
  };
  // EventEmitter's generic listener type is stricter than our payload helper.
  appEvents.on(event, wrapped as never);
}

function logFailure(event: string, listener: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ event: "events:listener-failed", sourceEvent: event, listener, message: scrubSensitive(message) }, "Event listener failed");
}
