import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError, BadRequestError, ValidationError } from "../lib/errors.js";
import { MAX_IMAGE_BYTES } from "../lib/image.js";

const MULTER_ERRORS: Record<string, () => AppError> = {
  LIMIT_FILE_SIZE: () => new AppError(`Photo is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`, 413, "PAYLOAD_TOO_LARGE"),
  LIMIT_FILE_COUNT: () => new BadRequestError("Send one photo per scan"),
  LIMIT_UNEXPECTED_FILE: () => new BadRequestError('Unexpected file field — send the photo as "image"'),
  LIMIT_FIELD_COUNT: () => new BadRequestError("Too many form fields"),
  LIMIT_PART_COUNT: () => new BadRequestError("Too many form parts"),
};

/**
 * One photo in the "image" field, held in memory (never written to disk) and
 * capped at MAX_IMAGE_BYTES while streaming, so an oversized upload is cut
 * off early. The real image check happens in prepareImage().
 */
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5, parts: 6 },
}).single("image");

export function uploadImage(req: Request, res: Response, next: NextFunction): void {
  single(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(MULTER_ERRORS[err.code]?.() ?? new BadRequestError(err.message));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      next(new ValidationError([{ field: "image", message: 'Attach the pack photo as multipart field "image"' }]));
      return;
    }
    next();
  });
}
