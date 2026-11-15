/** Month number (1-12) and integer year of a fractional year (1950.25 -> March 1950 is 1950 + 2/12). */
export function splitFractionalYear(fractionalYear: number): { year: number; month: number } {
  const year = Math.floor(fractionalYear + 1e-9);
  const month = Math.min(12, Math.max(1, Math.floor((fractionalYear - year) * 12 + 1e-6) + 1));
  return { year, month };
}

/** Localised month name for month 1-12. */
export function monthName(month: number, locale: string, style: 'long' | 'short' = 'long'): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, month - 1, 1))
    );
  } catch {
    return String(month);
  }
}

/** "March 1950" (long) or "Mar 1950" (short) for a fractional year. */
export function formatMonthYear(
  fractionalYear: number,
  locale: string,
  style: 'long' | 'short' = 'long'
): string {
  const { year, month } = splitFractionalYear(fractionalYear);
  return `${monthName(month, locale, style)} ${year}`;
}
