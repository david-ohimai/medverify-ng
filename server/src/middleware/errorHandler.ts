import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sendError } from "../lib/response.js";
import { scrubSensitive } from "../lib/scrub.js";

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, "ROUTE_NOT_FOUND", `Route not found: ${req.method} ${req.path}`);
}

/**
 * Global error handler — registered last in app.ts.
 * - Operational errors (AppError) go back to the client as they are.
 * - Known client mistakes (bad JSON, body too large, duplicate key) map to 4xx.
 * - Everything else is a bug: logged with secrets scrubbed, and the client gets
 *   a generic 500 with no stack trace or internal detail.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  const status = (err as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const message = status === 413 ? "Request body is too large" : "Malformed request body";
    sendError(res, status, status === 413 ? "PAYLOAD_TOO_LARGE" : "MALFORMED_REQUEST", message);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      sendError(res, 409, "CONFLICT", "A record with one of these values already exists");
      return;
    }
    if (err.code === "P2025") {
      sendError(res, 404, "NOT_FOUND", "Resource not found");
      return;
    }
  }

  const error = err instanceof Error ? err : new Error(String(err));
  logger.error(
    {
      event: "http:unhandled-error",
      method: req.method,
      path: req.path,
      error: { name: error.name, message: scrubSensitive(error.message), stack: scrubSensitive(error.stack ?? "") },
    },
    "Unhandled error"
  );
  sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
}
