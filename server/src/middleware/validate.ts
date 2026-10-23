import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../lib/errors.js";

/**
 * Validation gate. Runs BEFORE the controller; if the request doesn't match the
 * schema the controller is never called. The parsed result — with defaults
 * applied and unknown keys removed — is stored on req.validated, and
 * controllers read only from there.
 */
export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body ?? {},
      query: req.query ?? {},
      params: req.params ?? {},
    });

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      next(new ValidationError(details));
      return;
    }

    req.validated = result.data as Request["validated"];
    next();
  };
}
