/**
 * NAFDAC registration numbers are printed in many ways: "A4-1234",
 * "a4 – 1234", "NAFDAC Reg. No: A4-1234", "04-5678". Everything is reduced
 * to one canonical form before it is stored or looked up, so the same
 * product always matches.
 */

// Hyphen look-alikes OCR and keyboards produce: en/em dash, minus sign, etc.
const DASHES = /[‐-―−﹘﹣－]/g;
const PREFIX = /^\s*NAFDAC\s*(REG(ISTRATION)?\.?)?\s*(NO|NUMBER|N[O0]\.?)?\s*[:.#-]?\s*/i;

/** Canonical shape: optional letter, 1–2 digits, optional letter, hyphen, 4–6 digits, optional letter. */
const CANONICAL = /^[A-Z]?\d{1,2}[A-Z]?-\d{4,6}[A-Z]?$/;

export function normalizeNafdacNo(raw: string): string {
  return raw
    // Dashes first, so "NAFDAC No – A4-1234" (en dash) loses its separator with the prefix.
    .replace(DASHES, "-")
    .replace(PREFIX, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-+/g, "-");
}

export function isValidNafdacNo(normalized: string): boolean {
  return CANONICAL.test(normalized);
}

/** Batch numbers: upper case, no whitespace, hyphen look-alikes unified. */
export function normalizeBatchNo(raw: string): string {
  return raw.replace(DASHES, "-").toUpperCase().replace(/\s+/g, "");
}
