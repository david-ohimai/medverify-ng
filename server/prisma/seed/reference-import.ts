import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PackSide, RegistrySource } from "../../src/generated/prisma/enums.js";
import { prepareImage } from "../../src/lib/image.js";
import { isValidNafdacNo, normalizeNafdacNo } from "../../src/lib/nafdac.js";
import type { ReferenceImageRow } from "../../src/repositories/referenceImage.repository.js";

/** References are shown to the model next to the scan; 1024 px is plenty and halves the tokens. */
const REFERENCE_LONG_SIDE = 1024;
const FILE_NAME = /^(front|back|other)([-_][\w-]+)?\.(jpe?g|png|webp|heic)$/i;

/** A loaded photo, keyed by NAFDAC number until the product ids are known. */
export type LoadedReference = Omit<ReferenceImageRow, "productId"> & { nafdacNo: string };

export interface ReferenceLoad {
  rows: LoadedReference[];
  errors: string[];
  /** Folders whose product isn't loaded (e.g. demo folders under --no-demo). */
  skipped: string[];
}

/**
 * Reads prisma/seed/reference/<NAFDAC number>/<side>[-anything].jpg —
 * photos of the GENUINE pack, e.g. reference/A4-1234/front-1.jpg. Each file
 * is decoded, re-encoded (metadata stripped) and hashed; any problem is
 * reported as `folder/file: problem` and nothing is written.
 */
export async function loadReferenceImages(
  dir: string,
  products: Map<string, RegistrySource>
): Promise<ReferenceLoad> {
  const result: ReferenceLoad = { rows: [], errors: [], skipped: [] };
  if (!existsSync(dir)) return result;

  for (const folder of readdirSync(dir).sort()) {
    const folderPath = join(dir, folder);
    if (!statSync(folderPath).isDirectory()) continue;

    const nafdacNo = normalizeNafdacNo(folder);
    if (!isValidNafdacNo(nafdacNo)) {
      result.errors.push(`${folder}/: folder name must be a NAFDAC number (e.g. A4-1234)`);
      continue;
    }
    const source = products.get(nafdacNo);
    if (!source) {
      result.skipped.push(folder);
      continue;
    }

    for (const file of readdirSync(folderPath).sort()) {
      if (file.startsWith(".") || file.toLowerCase() === "readme.md") continue;
      const match = FILE_NAME.exec(file);
      if (!match) {
        result.errors.push(`${folder}/${file}: name it front-1.jpg, back-1.jpg or other-1.jpg (jpg, png, webp, heic)`);
        continue;
      }
      try {
        const image = await prepareImage(readFileSync(join(folderPath, file)), REFERENCE_LONG_SIDE);
        result.rows.push({
          nafdacNo,
          side: match[1]!.toLowerCase() as PackSide,
          data: image.data,
          width: image.width,
          height: image.height,
          sha256: image.hash,
          fileName: `prisma/seed/reference/${folder}/${file}`,
          // Photos of a fictional demo product are demo data too.
          source: source === "demo" ? "demo" : "pack_label",
        });
      } catch (err) {
        result.errors.push(`${folder}/${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return result;
}
