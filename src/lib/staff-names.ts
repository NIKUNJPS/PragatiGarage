/**
 * Car attendant / "bill created by" names are free text typed on each bill.
 * These helpers turn what was typed into tidy suggestion lists and report
 * groups, so "ramesh", "Ramesh " and "RAMESH" all count as one person.
 */

/** Grouping key for a typed name: trimmed, single-spaced, case-insensitive. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Distinct names in the order given (callers pass most recent first), keeping
 * the first spelling seen for each person.
 */
export function distinctNames(names: Array<string | null | undefined>, limit = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const key = nameKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push((raw ?? '').trim().replace(/\s+/g, ' '));
    if (out.length >= limit) break;
  }
  return out;
}
