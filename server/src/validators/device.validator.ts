import { z } from "zod";
import { AppLanguage, DevicePlatform } from "../generated/prisma/enums.js";

/** Bodies are strict: unknown fields are rejected, not silently ignored. */

export const registerDeviceSchema = z.object({
  body: z.strictObject({
    /** Random UUID v4 the app generates once and keeps in secure storage. */
    installId: z.uuidv4("installId must be a UUID v4"),
    platform: z.enum(DevicePlatform),
    appVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}(\+\d{1,6})?$/, "appVersion must look like 1.0.0 or 1.0.0+1"),
    language: z.enum(AppLanguage).default("en"),
  }),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>["body"];

export const refreshTokenSchema = z.object({
  body: z.strictObject({
    refreshToken: z.string().min(32).max(128),
  }),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>["body"];

export const elevateDeviceSchema = z.object({
  body: z.strictObject({
    pin: z.string().regex(/^\d{6,12}$/, "PIN must be 6-12 digits"),
  }),
});
export type ElevateDeviceInput = z.infer<typeof elevateDeviceSchema>["body"];

export const updateDeviceSchema = z.object({
  body: z
    .strictObject({
      language: z.enum(AppLanguage).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, "Send at least one field to update"),
});
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>["body"];
