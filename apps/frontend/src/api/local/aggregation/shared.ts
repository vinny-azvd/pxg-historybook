import type { Filters, TopDrop } from '../../types';

export type FilterQuery = Filters;

interface FilterableDoc {
  start_time: string;
  session_type: string;
  players: { id: number }[];
}

/** First 10 characters of a start_time string ("YYYY-MM-DD HH:MM:SS" or an
 * ISO "YYYY-MM-DDTHH:MM:SS...") are always the calendar date, matching how
 * SQLite's date() function reads it. */
export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

/** Replicates huntFilters.ts/terrorFilters.ts/mdFilters.ts's WHERE-builder
 * semantics as a plain predicate: player membership, calendar-date range
 * (not raw string/datetime compare - see dateOnly above), and session type. */
export function buildFilterPredicate<T extends FilterableDoc>(filter: FilterQuery): (doc: T) => boolean {
  const playerId = filter.player ? Number(filter.player) : undefined;
  const fromDate = filter.from ? dateOnly(filter.from) : undefined;
  const toDate = filter.to ? dateOnly(filter.to) : undefined;
  const sessionType = filter.sessionType;

  return (doc: T) => {
    if (playerId !== undefined && !doc.players.some((p) => p.id === playerId)) return false;
    if (fromDate !== undefined && dateOnly(doc.start_time) < fromDate) return false;
    if (toDate !== undefined && dateOnly(doc.start_time) > toDate) return false;
    if (sessionType && doc.session_type !== sessionType) return false;
    return true;
  };
}

// --- Correction 1 (see task spec): the backend's week bucket expression is
// `date(h.start_time, 'weekday 0', '-6 days')`, which - despite reading like
// "next Sunday minus 6 days" - actually always resolves to the MONDAY of the
// Mon-Sun week containing the date (a Sunday belongs to the week that just
// ended, not the one about to start). Verified empirically against
// node:sqlite's DatabaseSync for every day of 2026 - see the one-off script
// run during this task (not checked in). All bucketing below works in UTC
// only, never local time, to avoid timezone-dependent off-by-one bucketing
// near midnight.

export function bucketDay(dateOnlyValue: string): string {
  return dateOnlyValue;
}

export function bucketWeek(dateOnlyValue: string): string {
  const [y, m, d] = dateOnlyValue.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d);
  const dow = new Date(utcMs).getUTCDay(); // 0=Sunday..6=Saturday
  const daysSinceMonday = (dow + 6) % 7; // Monday=0 ... Sunday=6
  const weekStartMs = utcMs - daysSinceMonday * 86400000;
  return new Date(weekStartMs).toISOString().slice(0, 10);
}

export function bucketMonth(dateOnlyValue: string): string {
  return `${dateOnlyValue.slice(0, 7)}-01`;
}

export function bucketFn(bucket: string): (dateOnlyValue: string) => string {
  if (bucket === 'day') return bucketDay;
  if (bucket === 'month') return bucketMonth;
  return bucketWeek;
}

export function sum<T>(arr: T[], selector: (item: T) => number): number {
  let total = 0;
  for (const item of arr) total += selector(item);
  return total;
}

/** SQLite's AVG() over an empty set (or all-NULL column) is NULL, not NaN -
 * every ported average must mirror that, matching the `number | null` typing
 * already used throughout api/types.ts. */
export function avg<T>(arr: T[], selector: (item: T) => number): number | null {
  if (arr.length === 0) return null;
  return sum(arr, selector) / arr.length;
}

export function maxOf<T>(arr: T[], selector: (item: T) => number): number | null {
  if (arr.length === 0) return null;
  let best = -Infinity;
  for (const item of arr) {
    const value = selector(item);
    if (value > best) best = value;
  }
  return best;
}

/** `h.jade_totem_count > 0 AND (h.jade_totem_count * 3600) < h.duration_seconds` */
export function jadeSevere(doc: { jade_totem_count: number; duration_seconds: number }): boolean {
  return doc.jade_totem_count > 0 && doc.jade_totem_count * 3600 < doc.duration_seconds;
}

/** Top 5 non-ignored drops by unit_price descending (same as the
 * `hunt_drops`/`terror_drops`/`md_drops` correlated subquery used throughout
 * the backend's list/trend queries). */
export function topDrops(drops: { item: string; unit_price: number; ignored: number | null }[], n = 5): TopDrop[] {
  return [...drops]
    .filter((d) => d.ignored === null || d.ignored === undefined || d.ignored === 0)
    .sort((a, b) => b.unit_price - a.unit_price)
    .slice(0, n)
    .map((d) => ({ item: d.item, unitPrice: d.unit_price }));
}

/** Picks the doc with the highest ('max') or lowest ('min') `profit`. Ties
 * are resolved by keeping the first one encountered (array order), which is
 * an approximation of SQLite's tie-break for `ORDER BY profit {ASC,DESC}
 * LIMIT 1` with no secondary sort key - SQLite doesn't guarantee a specific
 * order for ties either, so this is a reasonable match rather than a
 * guaranteed bit-for-bit one. */
export function extremeByProfit<T extends { profit: number }>(docs: T[], direction: 'max' | 'min'): T | null {
  if (docs.length === 0) return null;
  let best = docs[0];
  for (const doc of docs) {
    if (direction === 'max' ? doc.profit > best.profit : doc.profit < best.profit) best = doc;
  }
  return best;
}

/** `GROUP BY <name column> ORDER BY count DESC, MAX(start_time) DESC LIMIT 1`,
 * skipping docs whose name is null (matches the `WHERE x.hunt_name IS NOT
 * NULL` clause added alongside the GROUP BY on the backend). */
export function mostFrequentName<T extends { start_time: string }>(
  docs: T[],
  nameOf: (doc: T) => string | null
): { name: string; count: number } | null {
  const groups = new Map<string, { count: number; maxStart: string }>();
  for (const doc of docs) {
    const name = nameOf(doc);
    if (name === null) continue;
    const existing = groups.get(name);
    if (existing) {
      existing.count += 1;
      if (doc.start_time > existing.maxStart) existing.maxStart = doc.start_time;
    } else {
      groups.set(name, { count: 1, maxStart: doc.start_time });
    }
  }

  let best: { name: string; count: number; maxStart: string } | null = null;
  for (const [name, g] of groups) {
    if (!best || g.count > best.count || (g.count === best.count && g.maxStart > best.maxStart)) {
      best = { name, count: g.count, maxStart: g.maxStart };
    }
  }
  return best ? { name: best.name, count: best.count } : null;
}
