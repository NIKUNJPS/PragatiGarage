/**
 * Exact money arithmetic. Amounts are integer paise (hundredths); anything that
 * could exceed Number.MAX_SAFE_INTEGER (quantity x price) is multiplied as a
 * BigInt. Rounding is always half away from zero, at 2 decimals.
 */

export type Paise = number;

export type DecimalInput = number | string | { toString(): string } | null | undefined;

const DECIMAL_RE = /^([+-])?(\d*)(?:\.(\d*))?$/;

/** Canonical plain-decimal string for any numeric input, or null if it is not a number. */
function decimalString(value: DecimalInput): string | null {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Six places captures the intended decimal of any double we can receive
    // (e.g. 3 * 333.335 = 1000.0049999999999 -> "1000.005000").
    return value.toFixed(6);
  }
  const raw = String(value).trim().replace(/,/g, '');
  if (raw === '') return '0';
  if (DECIMAL_RE.test(raw) && raw !== '.' && raw !== '+' && raw !== '-') return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(6) : null;
}

function divRoundHalfUp(n: bigint, d: bigint): bigint {
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const q = (abs * 2n + d) / (2n * d);
  return negative ? -q : q;
}

/** value x 10^scale as an exact BigInt, rounded half away from zero. */
export function scaleDecimal(value: DecimalInput, scale: number): bigint {
  const s = decimalString(value);
  const m = s === null ? null : DECIMAL_RE.exec(s);
  if (!m) throw new RangeError(`Not a valid number: ${String(value)}`);
  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = m[2] || '0';
  const frac = m[3] ?? '';
  const kept = frac.slice(0, scale).padEnd(scale, '0');
  let result = BigInt(intPart + kept);
  const rest = frac.slice(scale);
  if (rest.length > 0 && rest.charCodeAt(0) >= 53 /* '5' */) result += 1n;
  return sign * result;
}

export function isValidNumber(value: DecimalInput): boolean {
  const s = decimalString(value);
  return s !== null && DECIMAL_RE.test(s);
}

/** Number of decimal places the user actually typed (ignores trailing zeros). */
export function decimalPlaces(value: DecimalInput): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    const s = String(value);
    if (s.includes('e')) return Number.isInteger(value) ? 0 : 20;
    return (s.split('.')[1] ?? '').length;
  }
  const s = decimalString(value);
  const frac = s ? (DECIMAL_RE.exec(s)?.[3] ?? '') : '';
  return frac.replace(/0+$/, '').length;
}

function toSafe(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Amount is too large.');
  }
  return Number(n);
}

export function toPaise(value: DecimalInput): Paise {
  return toSafe(scaleDecimal(value, 2));
}

export function fromPaise(paise: Paise): number {
  return paise / 100;
}

/** "1234.50" - exact string for Prisma Decimal columns (never goes through a float). */
export function paiseToDecimalString(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const s = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${s}` : s;
}

/** quantity x unit price, rounded to the paisa. */
export function multiplyToPaise(quantity: DecimalInput, unitPrice: DecimalInput): Paise {
  const qty = scaleDecimal(quantity, 2); // hundredths of a unit
  const price = scaleDecimal(unitPrice, 2); // paise
  return toSafe(divRoundHalfUp(qty * price, 100n));
}

/** percent (e.g. 18 or 12.5) of an amount, rounded to the paisa. */
export function percentOfPaise(amount: Paise, percent: DecimalInput): Paise {
  const pct = scaleDecimal(percent, 2); // hundredths of a percent
  return toSafe(divRoundHalfUp(BigInt(amount) * pct, 10_000n));
}

/** amount x part / whole, rounded to the paisa (whole must be > 0). */
export function proportionPaise(amount: Paise, part: Paise, whole: Paise): Paise {
  if (whole <= 0) return 0;
  return toSafe(divRoundHalfUp(BigInt(amount) * BigInt(part), BigInt(whole)));
}

export function sumPaise(values: Paise[]): Paise {
  let total = 0;
  for (const v of values) total += v;
  if (!Number.isSafeInteger(total)) throw new RangeError('Amount is too large.');
  return total;
}

/** Round any number-ish value to 2 decimals exactly. */
export function roundMoney(value: DecimalInput): number {
  return fromPaise(toPaise(value));
}
