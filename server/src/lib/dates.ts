/** Plausible years for a medicine's manufacture or expiry. Anything else is a typo. */
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

/**
 * Expiry dates arrive as "YYYY-MM" (how packs print them) or "YYYY-MM-DD".
 * A month-only expiry means "good until the end of that month", so it
 * becomes the last day of the month, at UTC midnight. Typos such as
 * "0027-08" or "2027-02-30" are rejected, not reinterpreted.
 */
export function parseExpiry(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  // Date.UTC maps years 0–99 to 1900–1999, so check the year before using it.
  if (year < MIN_YEAR || year > MAX_YEAR || monthIndex < 0 || monthIndex > 11) return null;

  if (match[3] === undefined) {
    // Day 0 of the next month = last day of this month.
    return new Date(Date.UTC(year, monthIndex + 1, 0));
  }

  const date = new Date(Date.UTC(year, monthIndex, Number(match[3])));
  // Reject impossible days such as 2027-02-30 (which Date would roll over).
  return date.toISOString().slice(0, 10) === value ? date : null;
}

/** Today at UTC midnight, so date-only comparisons don't depend on the time of day. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
