import type { Request, Response } from "express";
import { sendSuccess } from "../lib/response.js";
import { registryService } from "../services/registry.service.js";
import type { ProductParams, ProductSearchQuery, ReferenceImageParams } from "../validators/product.validator.js";

export const registryController = {
  async search(req: Request, res: Response): Promise<void> {
    const { q, limit } = req.validated.query as ProductSearchQuery;
    const products = await registryService.search(q, limit);
    sendSuccess(res, 200, `${products.length} product(s) found`, products);
  },

  async getProduct(req: Request, res: Response): Promise<void> {
    const { nafdacNo } = req.validated.params as ProductParams;
    const product = await registryService.getProductWithBatches(nafdacNo);
    sendSuccess(res, 200, "Product", product);
  },

  /** Raw JPEG, not the JSON envelope. Reference photos never change, so they cache well. */
  async getReferenceImage(req: Request, res: Response): Promise<void> {
    const { nafdacNo, imageId } = req.validated.params as ReferenceImageParams;
    const image = await registryService.getReferenceImage(nafdacNo, imageId);
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", ETag: image.etag });
    if (req.fresh) {
      res.status(304).end();
      return;
    }
    res.status(200).send(image.data);
  },
};
