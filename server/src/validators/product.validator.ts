import { z } from "zod";

export const productSearchSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2, "Type at least 2 characters").max(100),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  }),
});
export type ProductSearchQuery = z.infer<typeof productSearchSchema>["query"];

export const productParamsSchema = z.object({
  params: z.object({
    nafdacNo: z.string().min(3).max(60),
  }),
});
export type ProductParams = z.infer<typeof productParamsSchema>["params"];
