/**
 * Expiry dates arrive as "YYYY-MM" (how packs print them) or "YYYY-MM-DD".
 * A month-only expiry means "good until the end of that month", so it
 * becomes the last day of the month, at UTC midnight.
 */
export function parseExpiry(value: string): Date | null {
  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (month) {
    const year = Number(month[1]);
    const monthIndex = Number(month[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) return null;
    // Day 0 of the next month = last day of this month.
    return new Date(Date.UTC(year, monthIndex + 1, 0));
  }

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) {
    const date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    // Reject impossible dates such as 2027-02-30 (which Date would roll over).
    return date.toISOString().slice(0, 10) === value ? date : null;
  }

  return null;
}

/** Today at UTC midnight, so date-only comparisons don't depend on the time of day. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
