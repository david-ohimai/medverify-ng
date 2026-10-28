import { z } from "zod";
import { nafdacNoField } from "./fields.js";

export const productSearchSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2, "Type at least 2 characters").max(100),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  }),
});
export type ProductSearchQuery = z.infer<typeof productSearchSchema>["query"];

export const productParamsSchema = z.object({
  params: z.object({
    // Same rule as everywhere else: a malformed number is a 422, never a lookup.
    nafdacNo: nafdacNoField,
  }),
});
export type ProductParams = z.infer<typeof productParamsSchema>["params"];
