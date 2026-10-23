import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `fn` with a correlation id attached. Everything it calls — services,
 * repositories, event listeners, log lines — can read the id without it being
 * passed through every function signature.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
