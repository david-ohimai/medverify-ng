import sharp from "sharp";
import { UnsupportedMediaError, ValidationError } from "./errors.js";
import { sha256 } from "./hash.js";

/** Upload limit for one pack photo. Phones produce 2–6 MB JPEGs. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Below this the label text is too small to read reliably. */
const MIN_SHORT_SIDE = 480;
/** Decompression-bomb guard: refuse anything over ~50 megapixels. */
const MAX_PIXELS = 50_000_000;
/** The AI reads labels well at this size, and it keeps uploads to providers small. */
const TARGET_LONG_SIDE = 1600;

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export interface PreparedImage {
  /** SHA-256 of the bytes the client sent: same photo → same hash → cached AI result. */
  hash: string;
  /** Re-encoded JPEG: rotated upright, resized, every metadata block (EXIF, GPS) removed. */
  data: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  originalFormat: string;
}

/**
 * Validates an uploaded photo by decoding it, the real format comes from the
 * file's bytes, never from its name or Content-Type, so a renamed file or a
 * script posing as an image is rejected. The output is a fresh JPEG, which
 * also strips location data the phone may have embedded.
 */
export async function prepareImage(input: Buffer, longSide = TARGET_LONG_SIDE): Promise<PreparedImage> {
  const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .metadata()
    .catch(() => {
      throw new UnsupportedMediaError("The file isn't an image we can read. Send a JPEG, PNG, WebP or HEIC photo.");
    });

  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new UnsupportedMediaError(`Unsupported image type (${metadata.format ?? "unknown"}). Send a JPEG, PNG, WebP or HEIC photo.`);
  }
  const { width = 0, height = 0 } = metadata;
  // EXIF orientations 5–8 swap width and height, but the short side is the same either way.
  if (Math.min(width, height) < MIN_SHORT_SIDE) {
    throw new ValidationError(
      [{ field: "image", message: `Photo is too small (${width}×${height}). Use at least ${MIN_SHORT_SIDE} px on the short side.` }],
      "Photo is too small to read"
    );
  }

  const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    hash: sha256(input),
    data,
    mimeType: "image/jpeg",
    width: info.width,
    height: info.height,
    originalFormat: metadata.format,
  };
}
