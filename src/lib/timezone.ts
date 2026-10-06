/**
 * Calendar days and months in the garage's own time zone.
 *
 * The server usually runs in UTC (Vercel), while the garage works in local time
 * (India: UTC+5:30). "Today" and "this month" must start at local midnight, or
 * a bill made at 2am would land on the previous day's report. The browser sends
 * its IANA time zone; these helpers turn local dates into exact UTC instants
 * for database queries. Pure and dependency-free (uses Intl).
 *
 * Date keys are plain strings: days are "YYYY-MM-DD", months are "YYYY-MM".
 */

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The requested zone if it is a real IANA zone, otherwise the garage default. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/** The browser's own zone (client only), for sending with report requests. */
export function browserTimeZone(): string {
  try {
    return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instant))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Milliseconds the zone is ahead of UTC at that instant (IST: +19,800,000). */
function offsetAt(instant: number, timeZone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  const w = wallClock(whole, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - whole;
}

/** UTC instant of local midnight at the start of a calendar day. */
function startOfLocalDay(year: number, month: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  // Re-check at the result in case a daylight-saving change sits in between.
  const second = guess - offsetAt(first, timeZone);
  return second;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** "YYYY-MM-DD" of the local calendar day that contains the instant. */
export function dateKeyInZone(instant: Date | number, timeZone: string): string {
  const w = wallClock(typeof instant === 'number' ? instant : instant.getTime(), timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function todayKey(timeZone: string, now = Date.now()): string {
  return dateKeyInZone(now, timeZone);
}

export function isDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isMonthKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const m = Number(value.slice(5));
  return m >= 1 && m <= 12;
}

/** Calendar arithmetic on day keys (no time zone involved). */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMonths(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}`;
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Every day key of the month, in order. */
export function daysOfMonth(monthKey: string): string[] {
  return Array.from({ length: daysInMonth(monthKey) }, (_, i) => `${monthKey}-${pad(i + 1)}`);
}

/** Half-open range [start, end) covering one local calendar day, as UTC instants. */
export function dayRange(dateKey: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [ny, nm, nd] = addDays(dateKey, 1).split('-').map(Number);
  return {
    start: new Date(startOfLocalDay(y, m, d, timeZone)),
    end: new Date(startOfLocalDay(ny, nm, nd, timeZone)),
  };
}

/** Half-open range [start, end) covering one local calendar month, as UTC instants. */
export function monthRange(monthKey: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: dayRange(`${monthKey}-01`, timeZone).start,
    end: dayRange(`${addMonths(monthKey, 1)}-01`, timeZone).start,
  };
}

/**
 * Index of the bucket an instant falls into, given ascending bucket start
 * instants; -1 before the first. Rows are bucketed this way instead of
 * formatting each timestamp, which stays fast for a year of bills.
 */
export function bucketIndex(starts: number[], instant: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= instant) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/* Display                                                                     */
/* -------------------------------------------------------------------------- */

/** "Tue, 06 Oct 2026" for a day key - formatted in UTC so the key never shifts a day. */
export function formatDayKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' },
): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
}

/** "October 2026" for a month key. */
export function formatMonthKey(
  monthKey: string,
  options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' },
): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
}
