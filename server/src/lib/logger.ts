import { pino } from "pino";
import { config } from "./config.js";
import { getCorrelationId } from "./requestContext.js";

/**
 * Structured logger. Log with objects and an `event` in namespace:action form:
 *   logger.info({ event: "device:registered", deviceId }, "Device registered")
 *
 * Every line carries the request's correlation id, and secrets are redacted
 * before anything is written.
 */
export const logger = pino({
  level: config.isTest ? "silent" : config.LOG_LEVEL,
  mixin() {
    const correlationId = getCorrelationId();
    return correlationId ? { correlationId } : {};
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.pin",
      "*.installId",
      "*.accessToken",
      "*.refreshToken",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
  // Readable colours on a developer machine; one JSON object per line elsewhere.
  transport:
    config.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        }
      : undefined,
});
