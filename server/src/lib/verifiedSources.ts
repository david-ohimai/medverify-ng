/**
 * The only sites the assistant's knowledge base may come from: the World
 * Health Organization and NAFDAC. The fetcher, the ingester and the search
 * tool all check this, so an unofficial page can't slip in at any step.
 */
export const VERIFIED_PUBLISHERS = {
  "who.int": "World Health Organization",
  "nafdac.gov.ng": "NAFDAC",
} as const;

export type VerifiedDomain = keyof typeof VERIFIED_PUBLISHERS;

/** The verified domain a URL belongs to (exact domain or a subdomain of it, HTTPS only), or null. */
export function verifiedDomain(url: string): VerifiedDomain | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
  const host = parsed.hostname.toLowerCase();
  for (const domain of Object.keys(VERIFIED_PUBLISHERS) as VerifiedDomain[]) {
    if (host === domain || host.endsWith(`.${domain}`)) return domain;
  }
  return null;
}

export function isVerifiedSource(url: string): boolean {
  return verifiedDomain(url) !== null;
}
