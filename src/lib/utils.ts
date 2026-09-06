import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Anything Prisma may hand back for a Decimal column. */
export type DecimalLike = number | string | { toString(): string } | null | undefined;

/** Convert a Prisma Decimal (or anything number-ish) to a JS number, safely. */
export function toNumber(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(typeof value === 'string' ? value : value.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Round to 2 decimals without binary-float drift (e.g. 1.005 -> 1.01). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  AUD: 'A$',
  CAD: 'C$',
};

export function currencySymbol(currency = 'INR'): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

export function formatCurrency(value: DecimalLike, currency = 'INR'): string {
  const amount = round2(toNumber(value));
  const formatted = amount.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currencySymbol(currency)}${formatted}`;
}

/** Compact form for stat cards: 1.2L / 12.4K etc. Falls back to the full number. */
export function formatCurrencyCompact(value: DecimalLike, currency = 'INR'): string {
  const amount = round2(toNumber(value));
  const sym = currencySymbol(currency);
  if (currency === 'INR') {
    if (amount >= 10000000) return `${sym}${(amount / 10000000).toFixed(2)}Cr`;
    if (amount >= 100000) return `${sym}${(amount / 100000).toFixed(2)}L`;
  } else if (amount >= 1000000) {
    return `${sym}${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) return `${sym}${(amount / 1000).toFixed(1)}K`;
  return formatCurrency(amount, currency);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function relativeDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

/** Uppercase + strip spaces/dashes so "mh 12 ab 1234" and "MH12AB1234" match. */
export function normalizeVehicleNumber(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

/** Pretty-print a normalised vehicle number for display: MH12AB1234 -> MH 12 AB 1234 */
export function prettyVehicleNumber(value: string): string {
  const v = normalizeVehicleNumber(value);
  const m = v.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ') : v;
}

/**
 * Reduce a phone number to digits only, keeping a country code if present.
 * "+91 98765-43210" -> "919876543210";  "9876543210" -> "919876543210" (default CC 91).
 */
export function toWhatsAppNumber(raw: string | null | undefined, defaultCountryCode = '91'): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) digits = defaultCountryCode + digits;
  return digits;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Start/end of the local day, used for "today" style stats and date filters. */
export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function debounceValueKey(value: string): string {
  return value.trim().toLowerCase();
}
