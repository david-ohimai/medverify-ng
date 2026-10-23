import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { API_PREFIX, JSON_BODY_LIMIT } from "./config/constants.js";
import { swaggerSpec } from "./config/swagger.js";
import { config } from "./lib/config.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { correlationId, requestLogger } from "./middleware/requestLogger.js";
import { sanitizeInput } from "./middleware/sanitize.js";
import { deviceRoutes } from "./routes/device.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import "./events/index.js";

/**
 * Builds the Express app without starting a server, so tests can import it
 * and send requests without binding a port. Middleware order matters:
 * context → logging → security headers → CORS → parsing → sanitising →
 * metrics → routes → 404 → error handler (always last).
 */
export function createApp() {
  const app = express();

  // Behind a proxy (Render), trust exactly N hops so req.ip is the real client
  // and rate limits can't be dodged by spoofing X-Forwarded-For.
  app.set("trust proxy", config.TRUST_PROXY);

  app.use(correlationId);
  app.use(requestLogger);

  // Swagger UI needs inline scripts and styles, so it gets its own, looser CSP.
  if (config.SWAGGER_ENABLED) {
    app.use(
      "/api-docs",
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
          },
        },
      }),
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec)
    );
    app.get("/api-docs.json", (_req, res) => {
      res.json(swaggerSpec);
    });
  }

  // A JSON API serves no HTML, so the CSP allows nothing to load.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    })
  );

  // The mobile app sends no Origin header and isn't affected by CORS. Browsers
  // are only allowed from the explicit allowlist — never "*".
  app.use(
    cors({
      origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id"],
      exposedHeaders: ["X-Correlation-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
      maxAge: 86400,
    })
  );

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(sanitizeInput);
  app.use(metricsMiddleware);

  app.use(healthRoutes);
  app.use(`${API_PREFIX}/devices`, deviceRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
