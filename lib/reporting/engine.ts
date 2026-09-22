// Reporting engine — shared primitives.
//
// Phase 2.3 of the 2026-09-22 operational-readiness build
// (VAULT_BUILD_CHECKLIST.md). app/api/reporting/route.ts today is a 791-line
// chain of `if (section === "...")` blocks — 6 real sections (sales, orders,
// workshop, quotes, customers, staff; inventory is a stub), each
// independently re-implementing the same shapes: fetch rows in a date range,
// bucket them by day, bucket them by some other dimension, compare against
// the prior period, take a top-N list. This file factors out exactly those
// repeated shapes as small, composable, independently-testable functions —
// it does NOT try to force every report into one giant generic query-builder
// object, since each section's remaining logic (overdue detection, turnaround
// time, etc.) is genuinely bespoke and shouldn't be squeezed into a config
// blob just to look "generic."
//
// Per Josh's instruction: build this once, then generate the named reports
// from it rather than hand-building each as a one-off page. Sections migrate
// to these helpers incrementally — see VAULT_BUILD_CHECKLIST.md for which
// ones have moved over vs. still on the original hardcoded path.

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function diffDays(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/** The immediately-preceding period of the same length as [start, end]. */
export function priorPeriodRange(start: string, end: string): { priorStart: string; priorEnd: string } {
  const duration = diffDays(start, end) + 1;
  const priorEnd = addDays(start, -1);
  const priorStart = addDays(priorEnd, -(duration - 1));
  return { priorStart, priorEnd };
}

/** Percent change from `prior` to `current`, or null when there's no prior
 *  baseline to compare against (matches existing sections' own convention —
 *  0 vs. some-positive-number is not a meaningful "% change"). */
export function percentChange(current: number, prior: number): number | null {
  return prior > 0 ? ((current - prior) / prior) * 100 : null;
}

export function sumBy<T>(rows: T[], field: (row: T) => number | null | undefined): number {
  return rows.reduce((s, r) => s + (field(r) ?? 0), 0);
}

export function average(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

/**
 * Groups rows by an arbitrary key, summing an optional numeric field and
 * always counting rows — this is the "byDay"/"byType"/"byStaff" pattern
 * repeated across every existing report section, generalized.
 */
export function groupByKey<T>(
  rows: T[],
  keyFn: (row: T) => string,
  sumField?: (row: T) => number | null | undefined
): Array<{ key: string; count: number; sum: number }> {
  const buckets = new Map<string, { key: string; count: number; sum: number }>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!buckets.has(key)) buckets.set(key, { key, count: 0, sum: 0 });
    const b = buckets.get(key)!;
    b.count += 1;
    if (sumField) b.sum += sumField(row) ?? 0;
  }
  return Array.from(buckets.values());
}

/** Top N rows by a numeric field, descending. */
export function topN<T>(rows: T[], sortField: (row: T) => number | null | undefined, n: number): T[] {
  return [...rows].sort((a, b) => (sortField(b) ?? 0) - (sortField(a) ?? 0)).slice(0, n);
}
