import { z } from "zod";
import { batchNoField, expiryField, nafdacNoField } from "./fields.js";

export const manualVerificationSchema = z.object({
  body: z.strictObject({
    nafdacNo: nafdacNoField,
    /** The name printed on the pack — lets us catch a real number on the wrong product. */
    productName: z.string().trim().min(2).max(200).optional(),
    batchNo: batchNoField.optional(),
    expiry: expiryField.optional(),
  }),
});
export type ManualVerificationInput = z.infer<typeof manualVerificationSchema>["body"];
