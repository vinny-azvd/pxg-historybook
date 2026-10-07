// Per-hour rates are always derived from totals and duration, never read
// from the export's *_per_hour columns: the game floors those to an integer
// (a hunt with 8 rares in 2.01h is stored as 3/h instead of 3.98), and
// averaging per-session rates lets a 15-minute session weigh as much as a
// 3-hour one. Mirrored by perHour/rareKillsPerHour in the frontend's
// api/local/aggregation/shared.ts so both data modes give the same numbers.

/** Time-weighted "X/h médio" over a group of sessions: total ÷ hours played.
 * NULL when the group has no duration, same as AVG() over an empty set. */
export function perHourSql(alias: string, totalColumn: string): string {
  return `SUM(${alias}.${totalColumn}) * 3600.0 / NULLIF(SUM(${alias}.duration_seconds), 0)`;
}

/** Same as perHourSql, for the damage columns the export rates per second. */
export function perSecondSql(alias: string, totalColumn: string): string {
  return `SUM(${alias}.${totalColumn}) * 1.0 / NULLIF(SUM(${alias}.duration_seconds), 0)`;
}

/** One session's rare kills per hour, NULL for a zero-length session. */
export function rareKillsPerHourSql(alias: string): string {
  return `(${alias}.rare_kills * 3600.0 / NULLIF(${alias}.duration_seconds, 0))`;
}

/** Variant for list rows and detail records, whose rare_kills_per_hour field
 * is a plain number: a zero-length session reads as 0/h, which is also what
 * the export itself writes there. Sorting uses this same expression so the
 * order matches the values shown. */
export function rareKillsPerHourOrZeroSql(alias: string): string {
  return `COALESCE(${rareKillsPerHourSql(alias)}, 0)`;
}

/** Replaces a raw session row's stored rare_kills_per_hour (from a
 * `SELECT *`) with the recomputed one - same value as
 * rareKillsPerHourOrZeroSql. A missing row passes through untouched. */
export function withRareKillsPerHour<T>(row: T): T {
  if (!row) return row;
  const session = row as T & { rare_kills: number; duration_seconds: number | null };
  return {
    ...session,
    rare_kills_per_hour: session.duration_seconds ? (session.rare_kills * 3600) / session.duration_seconds : 0,
  };
}
