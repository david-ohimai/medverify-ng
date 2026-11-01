import { STATUS_CODES } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sendError } from "../lib/response.js";
import { scrubSensitive } from "../lib/scrub.js";

/** body-parser's error types → precise, honest client errors. */
const BODY_PARSER_ERRORS: Record<string, { code: string; message: string }> = {
  "entity.parse.failed": { code: "MALFORMED_REQUEST", message: "Malformed request body" },
  "entity.too.large": { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
  "entity.verify.failed": { code: "MALFORMED_REQUEST", message: "Request body could not be verified" },
  "request.size.invalid": { code: "MALFORMED_REQUEST", message: "Request size did not match Content-Length" },
  "request.aborted": { code: "REQUEST_ABORTED", message: "Request was aborted" },
  "charset.unsupported": { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported charset, send UTF-8" },
  "encoding.unsupported": { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported content encoding" },
};

/**
 * A library error that carries a 4xx status (body-parser, http-errors) is
 * the client's fault: report it with its own status and an accurate message
 * instead of a generic one. Anything else returns null and is treated as a bug.
 */
function describeClientError(err: unknown): { status: number; code: string; message: string } | null {
  const { status, type } = err as { status?: unknown; type?: unknown };
  if (typeof status !== "number" || status < 400 || status >= 500) return null;

  const known = typeof type === "string" ? BODY_PARSER_ERRORS[type] : undefined;
  if (known) return { status, ...known };

  const reason = STATUS_CODES[status] ?? "Bad request";
  return { status, code: reason.toUpperCase().replace(/[^A-Z]+/g, "_"), message: reason };
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, "ROUTE_NOT_FOUND", `Route not found: ${req.method} ${req.path}`);
}

/**
 * Global error handler, registered last in app.ts.
 * - Operational errors (AppError) go back to the client as they are.
 * - Library errors with a 4xx status keep that status and an accurate reason;
 *   a duplicate key maps to 409.
 * - Everything else is a bug: logged with secrets scrubbed, and the client gets
 *   a generic 500 with no stack trace or internal detail.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  const clientError = describeClientError(err);
  if (clientError) {
    logger.warn({ event: "http:client-error", status: clientError.status, code: clientError.code, path: req.path });
    sendError(res, clientError.status, clientError.code, clientError.message);
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
