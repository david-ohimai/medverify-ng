import { z } from "zod";
import { bothOrNeither, bothOrNeitherMessage, locationFields } from "./fields.js";

/** Form fields sent with the photo (multipart). The photo itself is checked by the upload middleware. */
export const scanUploadSchema = z.object({
  body: z.strictObject(locationFields).refine(bothOrNeither, bothOrNeitherMessage),
});
export type ScanUploadInput = z.infer<typeof scanUploadSchema>["body"];

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
