import { Router } from "express";
import { registryController } from "../controllers/registry.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { apiLimiter, searchLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { productParamsSchema, productSearchSchema, referenceImageParamsSchema } from "../validators/product.validator.js";

export const registryRoutes = Router();

registryRoutes.use(authenticate, apiLimiter);

/**
 * @openapi
 * /api/v1/products/search:
 *   get:
 *     tags: [Registry]
 *     summary: Search the NAFDAC registry by number or (fuzzy) name
 *     description: Number prefixes rank first ("A4-12"), then names by pg_trgm similarity, so a misread "C0artem" still finds Coartem.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, required: true, schema: { type: string, minLength: 2 }, example: "coartem" }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 20, default: 10 } }
 *     responses:
 *       200: { description: Matching products with a similarity score }
 *       422: { description: Query too short }
 *       429: { description: Too many searches }
 */
registryRoutes.get("/search", searchLimiter, validate(productSearchSchema), registryController.search);

/**
 * @openapi
 * /api/v1/products/{nafdacNo}:
 *   get:
 *     tags: [Registry]
 *     summary: One registered product, its known batches and its genuine-pack reference photos (metadata)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: nafdacNo, required: true, schema: { type: string }, example: "A4-1234" }
 *     responses:
 *       200: { description: Product with batches and referenceImages [{ id, side, width, height }] }
 *       404: { description: Not registered }
 * /api/v1/products/{nafdacNo}/reference-images/{imageId}:
 *   get:
 *     tags: [Registry]
 *     summary: A genuine-pack reference photo (image/jpeg) — e.g. to show beside the user's scan
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: nafdacNo, required: true, schema: { type: string }, example: "X9-0001" }
 *       - { in: path, name: imageId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: JPEG, content: { image/jpeg: { schema: { type: string, format: binary } } } }
 *       304: { description: Not modified (ETag) }
 *       404: { description: No such photo for this product }
 */
registryRoutes.get("/:nafdacNo", validate(productParamsSchema), registryController.getProduct);
registryRoutes.get(
  "/:nafdacNo/reference-images/:imageId",
  validate(referenceImageParamsSchema),
  registryController.getReferenceImage
);
