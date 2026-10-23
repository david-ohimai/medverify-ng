export interface ErrorDetail {
  field?: string;
  message: string;
}

/**
 * Operational errors: expected failures the client caused or can act on
 * (bad input, missing token, not found). The global error handler returns
 * them as-is. Anything that is NOT an AppError is treated as a programming
 * bug: logged in full and returned as a generic 500.
 */
export class AppError extends Error {
  public readonly isOperational = true;

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details: ErrorDetail[] = []
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details: ErrorDetail[] = []) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class ValidationError extends AppError {
  constructor(details: ErrorDetail[], message = "Validation failed") {
    super(message, 422, "VALIDATION_FAILED", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorised", code = "UNAUTHORISED") {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code = "FORBIDDEN") {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests, please try again later") {
    super(message, 429, "RATE_LIMITED");
  }
}
