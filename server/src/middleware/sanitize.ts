import type { NextFunction, Request, Response } from "express";
import xss from "xss";

const STRIP_ALL_HTML = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
};

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return xss(value, STRIP_ALL_HTML);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) clean[key] = sanitizeValue(item);
    return clean;
  }
  return value;
}

/**
 * Strips HTML from every string in the body, query and params before
 * validation sees them. Zod checks shape; this removes dangerous content.
 * (Express 5 exposes req.query as a getter, so it is redefined, not assigned.)
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.params) req.params = sanitizeValue(req.params) as Request["params"];
  Object.defineProperty(req, "query", {
    value: sanitizeValue(req.query),
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
}
