/**
 * Tournament dates are stored as the raw string a form control produced:
 * `YYYY-MM-DDTHH:mm` from today's datetime-local inputs, and bare `YYYY-MM-DD`
 * from the date-only picker the create form used before it was aligned with the
 * settings page. Both mean a local wall-clock time, and both are still in the
 * database, so every reader has to cope with either shape.
 */

/**
 * Normalise a stored date to what `<input type="datetime-local">` will display.
 *
 * The control renders nothing at all for a value it can't parse, so a legacy
 * date-only tournament shows an empty Tournament Date box that reads as "never
 * set" — and saving the form from that state writes the emptiness back, losing
 * the date the public page is still advertising.
 */
export function toDateTimeLocalValue(stored: string | null | undefined): string {
  if (!stored) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return `${stored}T00:00`;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(stored);
  return match ? match[1] : '';
}

/**
 * Parse a stored date as local time, for display.
 *
 * `new Date('2026-09-26')` is midnight *UTC* — it formats as the 25th in every
 * timezone west of Greenwich, so a date-only tournament advertises the wrong
 * day. Building from the parts keeps the day the director typed, and a
 * datetime-local string is local time under the same rule.
 */
export function parseStoredDate(stored: string | null | undefined): Date | null {
  if (!stored) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(stored);
  if (!m) {
    const loose = new Date(stored);
    return isNaN(loose.getTime()) ? null : loose;
  }
  const [, year, month, day, hours = '0', mins = '0'] = m;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(mins));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Format a stored date for display, or '' when there isn't a usable one. */
export function formatStoredDate(
  stored: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const parsed = parseStoredDate(stored);
  return parsed ? parsed.toLocaleDateString('en-US', options) : '';
}
