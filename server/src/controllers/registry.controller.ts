import type { Request, Response } from "express";
import { sendSuccess } from "../lib/response.js";
import { registryService } from "../services/registry.service.js";
import type { ProductParams, ProductSearchQuery } from "../validators/product.validator.js";

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
};
