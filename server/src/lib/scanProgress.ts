import type { Redis } from "ioredis";
import { logger } from "./logger.js";
import { redis } from "./redis.js";

export type ScanStep = "receive" | "read_label" | "registry" | "batch_check" | "compare_pack" | "score";

export type ScanProgressEvent =
  | { type: "step"; step: ScanStep; status: "active" | "done" | "skipped"; label: string; detail?: string }
  | { type: "verdict"; scanId: string; result: unknown }
  | { type: "error"; scanId: string; code: string; message: string };

export type SequencedEvent = ScanProgressEvent & { seq: number; at: string };

/** Progress is only interesting while someone may be watching. */
const EVENTS_TTL_SECONDS = 60 * 60;

const listKey = (scanId: string) => `scan:events:${scanId}`;
// ioredis applies keyPrefix to keys only, not to pub/sub channels, so the prefix is written out.
const channel = (scanId: string) => `medverify:scan-events:${scanId}`;

let subscriber: Redis | undefined;
const listeners = new Map<string, Set<(event: SequencedEvent) => void>>();

/** One shared subscriber connection for every open SSE stream (a subscribed connection can't run other commands). */
function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = redis.duplicate();
    subscriber.on("message", (from: string, message: string) => {
      const handlers = listeners.get(from);
      if (!handlers) return;
      const event = JSON.parse(message) as SequencedEvent;
      for (const handler of handlers) handler(event);
    });
    subscriber.on("error", (err: Error) => {
      logger.error({ event: "scan-progress:subscriber-error", message: err.message }, "Progress subscriber error");
    });
  }
  return subscriber;
}

/**
 * Pipeline progress, so the app can "watch the AI think". Every event is
 * appended to a short-lived Redis list (a stream that opens late, or
 * reconnects, replays what it missed) and published on a channel (open
 * streams get it at once). Works across processes: the worker publishes,
 * whichever API instance holds the SSE connection forwards it.
 */
export const scanProgress = {
  async publish(scanId: string, event: ScanProgressEvent): Promise<void> {
    try {
      const key = listKey(scanId);
      const seq = await redis.rpush(key, "");
      const sequenced: SequencedEvent = { ...event, seq, at: new Date().toISOString() };
      const payload = JSON.stringify(sequenced);
      await redis.multi().lset(key, seq - 1, payload).expire(key, EVENTS_TTL_SECONDS).exec();
      await redis.publish(channel(scanId), payload);
    } catch (err) {
      // Progress is a nicety: the scan result is in Postgres either way.
      logger.warn({ event: "scan-progress:publish-failed", scanId, message: (err as Error).message }, "Progress publish failed");
    }
  },

  async history(scanId: string): Promise<SequencedEvent[]> {
    const items = await redis.lrange(listKey(scanId), 0, -1);
    return items.filter(Boolean).map((item) => JSON.parse(item) as SequencedEvent);
  },

  /** Live events for one scan. Returns the unsubscribe function. */
  async subscribe(scanId: string, handler: (event: SequencedEvent) => void): Promise<() => Promise<void>> {
    const name = channel(scanId);
    let handlers = listeners.get(name);
    if (!handlers) {
      handlers = new Set();
      listeners.set(name, handlers);
      await getSubscriber().subscribe(name);
    }
    handlers.add(handler);

    return async () => {
      handlers.delete(handler);
      if (handlers.size === 0 && listeners.get(name) === handlers) {
        listeners.delete(name);
        await subscriber?.unsubscribe(name).catch(() => undefined);
      }
    };
  },

  async close(): Promise<void> {
    await subscriber?.quit().catch(() => undefined);
    subscriber = undefined;
  },
};
