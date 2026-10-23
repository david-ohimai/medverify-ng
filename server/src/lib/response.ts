import type { Response } from "express";
import type { ErrorDetail } from "./errors.js";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * The envelope every endpoint returns, success and error alike:
 *   { success, message, statusCode, code, data, errors, meta }
 * The mobile app parses this one shape for every call.
 */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  statusCode: number;
  code: string | null;
  data: T | null;
  errors: ErrorDetail[];
  meta: PaginationMeta | null;
}

export function sendSuccess<T>(res: Response, statusCode: number, message: string, data: T, meta?: PaginationMeta): void {
  const body: ApiEnvelope<T> = {
    success: true,
    message,
    statusCode,
    code: null,
    data,
    errors: [],
    meta: meta ?? null,
  };
  res.status(statusCode).json(body);
}

export function errorBody(statusCode: number, code: string, message: string, errors: ErrorDetail[] = []): ApiEnvelope<null> {
  return { success: false, message, statusCode, code, data: null, errors, meta: null };
}

export function sendError(res: Response, statusCode: number, code: string, message: string, errors: ErrorDetail[] = []): void {
  res.status(statusCode).json(errorBody(statusCode, code, message, errors));
}
