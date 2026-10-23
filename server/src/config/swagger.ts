import { fileURLToPath } from "node:url";
import swaggerJsdoc from "swagger-jsdoc";

// Globs need forward slashes, even on Windows.
const routesDir = fileURLToPath(new URL("../routes/", import.meta.url)).replace(/\\/g, "/");

/**
 * OpenAPI spec built from the @openapi comments above each route. Works from
 * both src/ (tsx in development) and dist/ (compiled), because the path is
 * resolved relative to this file.
 */
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.1.0",
    info: {
      title: "MedVerify NG API",
      version: "0.1.0",
      description:
        "Verify a medicine before you take it. Every response uses the envelope " +
        "{ success, message, statusCode, code, data, errors, meta }.",
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  },
  apis: [`${routesDir}*.ts`, `${routesDir}*.js`],
});
