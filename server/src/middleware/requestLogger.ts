import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger.js";
import { runWithContext } from "../lib/requestContext.js";

const CORRELATION_HEADER = "x-correlation-id";
/** Accept a caller's id only if it looks like an id — never echo arbitrary text. */
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request a correlation id (reusing the caller's if it is safe),
 * returns it in the X-Correlation-Id header, and runs the rest of the request
 * inside a context so every log line and audit row carries it.
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Correlation-Id", id);
  runWithContext({ correlationId: id }, next);
}

/** One structured log line per request: method, url, status, duration. */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (_req, res) => String(res.getHeader("X-Correlation-Id") ?? randomUUID()),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  autoLogging: {
    // Health and metrics are polled constantly; logging them hides real traffic.
    ignore: (req) => req.url?.startsWith("/health") === true || req.url === "/metrics",
  },
});
