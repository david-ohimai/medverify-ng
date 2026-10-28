import { z } from "zod";

export const listScansSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
export type ListScansQuery = z.infer<typeof listScansSchema>["query"];

export const scanParamsSchema = z.object({
  params: z.object({
    // A malformed id is a 422, never a database error.
    id: z.uuid("Scan id must be a UUID"),
  }),
});
export type ScanParams = z.infer<typeof scanParamsSchema>["params"];
