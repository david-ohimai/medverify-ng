import { isValidNafdacNo, normalizeNafdacNo } from "../../src/lib/nafdac.js";

/** The fields used from one row of greenbook.nafdac.gov.ng's product table. */
export interface GreenbookRecord {
  product_name?: string | null;
  NAFDAC?: string | null;
  strength?: string | null;
  status?: string | null;
  approval_date?: string | null;
  deleted_at?: string | null;
  ingredient?: { ingredient_name?: string | null } | null;
  form?: { name?: string | null } | null;
  applicant?: { name?: string | null } | null;
}

export interface GreenbookProduct {
  nafdac_no: string;
  brand_name: string;
  generic_name: string;
  strength: string;
  dosage_form: string;
  manufacturer: string;
  status: "active" | "expired";
  source: "greenbook";
  approvalDate: string;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };

/** Cleans a Greenbook cell: entities decoded, spacing collapsed, cut to the column's limit. */
function clean(value: string | null | undefined, max: number): string {
  const text = (value ?? "")
    .replace(/&(amp|#039|quot|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

/** One Greenbook record as a registry row, or null when it can't be used. */
export function toProduct(record: GreenbookRecord): GreenbookProduct | null {
  if (record.deleted_at) return null;
  const nafdacNo = normalizeNafdacNo(record.NAFDAC ?? "");
  // The site marks names with # and * footnotes; its own page strips them too.
  const brand = clean((record.product_name ?? "").replace(/[#*]/g, ""), 120);
  // "00-0000" is the site's placeholder for products with no number; a fake could print it too.
  if (!isValidNafdacNo(nafdacNo) || /-0+[A-Z]?$/.test(nafdacNo) || brand === "") return null;
  return {
    nafdac_no: nafdacNo,
    brand_name: brand,
    generic_name: clean(record.ingredient?.ingredient_name, 200) || brand,
    strength: clean(record.strength, 80),
    dosage_form: clean(record.form?.name, 60),
    manufacturer: clean(record.applicant?.name, 160),
    status: record.status?.trim().toLowerCase() === "active" ? "active" : "expired",
    source: "greenbook",
    approvalDate: record.approval_date ?? "",
  };
}

/** A number can be listed more than once (renewals): keep an active row, then the newest approval. */
export function dedupe(products: GreenbookProduct[]): GreenbookProduct[] {
  const best = new Map<string, GreenbookProduct>();
  for (const product of products) {
    const current = best.get(product.nafdac_no);
    if (!current || rank(product) > rank(current)) best.set(product.nafdac_no, product);
  }
  return [...best.values()].sort((a, b) => a.nafdac_no.localeCompare(b.nafdac_no));
}

const rank = (product: GreenbookProduct) => `${product.status === "active" ? 1 : 0}${product.approvalDate}`;

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function toCsv(products: GreenbookProduct[], retrievedOn: string): string {
  const lines = [
    `# Real NAFDAC registrations from https://greenbook.nafdac.gov.ng, retrieved ${retrievedOn} by npm run registry:fetch.`,
    "nafdac_no,brand_name,generic_name,strength,dosage_form,manufacturer,status,source",
    ...products.map((p) =>
      [p.nafdac_no, p.brand_name, p.generic_name, p.strength, p.dosage_form, p.manufacturer, p.status, p.source]
        .map(csvCell)
        .join(",")
    ),
  ];
  return `${lines.join("\n")}\n`;
}
