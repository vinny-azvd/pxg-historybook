import { db } from '../db/connection.js';
import { buildHuntFilter, type HuntFilterQuery } from './huntFilters.js';
import { buildMdFilter } from './mdFilters.js';
import type { NameCount } from './nameCounts.js';
import { canonicalEnemyName } from './enemyNames.js';
import { perHourSql } from './rates.js';

// Backs the "Raros" page: hunts and MDs side by side. A rare is whatever the
// export flagged `rare` - never guessed from the name ("Giant Porygon" is a
// rare, a plain "Giant" spawn elsewhere may not be). Terror rotations don't
// flag any today, so they're left out.
//
// Two sources of truth, on purpose:
// - session-level `rare_kills` drives every total, rate and timeline bar, so
//   the page agrees with the Hunts/MD dashboards;
// - the per-enemy rare rows say WHICH rares died (species, events). An export
//   can count rares without listing them, so the gap is reported as
//   "unidentified" instead of silently dropped.
// Mirrored by apps/frontend/src/api/local/aggregation/rares.ts so both data
// modes return the same summary.

export type RareOrigin = 'hunt' | 'md';

export interface RaresFilterQuery extends HuntFilterQuery {
  origin?: string;
  bucket?: string;
}

export interface RareEvent {
  id: string;
  origin: RareOrigin;
  entryId: number;
  entryName: string | null;
  startTime: string;
  enemy: string;
  count: number;
  fromNightmareCrystal: boolean;
}

export interface RareSpeciesRow {
  enemy: string;
  origins: RareOrigin[];
  count: number;
  nightmareCrystalCount: number;
  lastAt: string;
  entryNames: NameCount[];
}

export interface RareEntryRow {
  name: string;
  origin: RareOrigin;
  sessions: number;
  rareKills: number;
  durationSeconds: number;
  rareKillsPerHour: number | null;
}

export interface RareTimelinePoint {
  bucketStart: string;
  hunt: number;
  md: number;
}

export interface RaresSummary {
  totalRareKills: number;
  identifiedRareKills: number;
  unidentifiedRareKills: number;
  totalDurationSeconds: number;
  rareKillsPerHour: number | null;
  sessions: number;
  sessionsWithRares: number;
  nightmareCrystalRares: number;
  nightmareCrystalsBroken: number;
  lastRare: RareEvent | null;
  species: RareSpeciesRow[];
  byEntry: RareEntryRow[];
  timeline: RareTimelinePoint[];
  events: RareEvent[];
}

interface OriginSource {
  origin: RareOrigin;
  table: string;
  alias: string;
  nameColumn: string;
  enemiesTable: string;
  foreignKey: string;
  // MD exports have no Nightmare Crystal annotation - a constant keeps the
  // event query identical for both origins.
  nightmareCrystalColumn: string;
  buildFilter: (filter: HuntFilterQuery) => { whereClause: string; params: Record<string, string | number> };
}

const SOURCES: Record<RareOrigin, OriginSource> = {
  hunt: {
    origin: 'hunt',
    table: 'hunts',
    alias: 'h',
    nameColumn: 'hunt_name',
    enemiesTable: 'hunt_enemies_defeated',
    foreignKey: 'hunt_id',
    nightmareCrystalColumn: 'ed.from_nightmare_crystal',
    buildFilter: buildHuntFilter,
  },
  md: {
    origin: 'md',
    table: 'mds',
    alias: 't',
    nameColumn: 'md_name',
    enemiesTable: 'md_enemies_defeated',
    foreignKey: 'md_id',
    nightmareCrystalColumn: '0',
    buildFilter: buildMdFilter,
  },
};

// Same bucket boundaries as the trend endpoints (Monday-start weeks,
// YYYY-MM-01 months), so a week on this page is the same week everywhere.
function bucketExpression(alias: string, bucket: string | undefined): string {
  if (bucket === 'day') return `date(${alias}.start_time)`;
  if (bucket === 'month') return `strftime('%Y-%m-01', ${alias}.start_time)`;
  return `date(${alias}.start_time, 'weekday 0', '-6 days')`;
}

function and(whereClause: string, condition: string): string {
  return whereClause ? `${whereClause} AND ${condition}` : `WHERE ${condition}`;
}

/** Name of the "crystal" enemy row a broken Nightmare Crystal leaves behind
 * in hunt exports - not a rare itself, but it's how many crystals were used. */
const NIGHTMARE_CRYSTAL_ENEMY = 'nightmare crystal';

interface OriginData {
  sessions: number;
  sessionsWithRares: number;
  rareKills: number;
  durationSeconds: number;
  unidentifiedRareKills: number;
  nightmareCrystalsBroken: number;
  byEntry: RareEntryRow[];
  timeline: { bucketStart: string; rareKills: number }[];
  events: (RareEvent & { rowId: number })[];
}

function loadOrigin(source: OriginSource, filter: RaresFilterQuery): OriginData {
  const { table, alias: x, nameColumn, enemiesTable, foreignKey } = source;
  const { whereClause, params } = source.buildFilter(filter);

  // Unidentified is measured per session against ALL of that session's rare
  // rows (whoever got the kill), so a player filter on a party hunt doesn't
  // mistake teammates' rares for missing ones. MAX(..., 0) keeps a session
  // that lists more rows than its counter from cancelling out another one.
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS sessions,
         COALESCE(SUM(CASE WHEN ${x}.rare_kills > 0 THEN 1 ELSE 0 END), 0) AS sessionsWithRares,
         COALESCE(SUM(${x}.rare_kills), 0) AS rareKills,
         COALESCE(SUM(${x}.duration_seconds), 0) AS durationSeconds,
         COALESCE(SUM(MAX(${x}.rare_kills - COALESCE(
           (SELECT SUM(ed.count) FROM ${enemiesTable} ed WHERE ed.${foreignKey} = ${x}.id AND ed.rare = 1), 0), 0)), 0)
           AS unidentifiedRareKills
       FROM ${table} ${x}
       ${whereClause}`
    )
    .get(params) as {
    sessions: number;
    sessionsWithRares: number;
    rareKills: number;
    durationSeconds: number;
    unidentifiedRareKills: number;
  };

  const byEntry = (
    db
      .prepare(
        `SELECT
           COALESCE(${x}.${nameColumn}, 'Sem nome') AS name,
           COUNT(*) AS sessions,
           COALESCE(SUM(${x}.rare_kills), 0) AS rareKills,
           COALESCE(SUM(${x}.duration_seconds), 0) AS durationSeconds,
           ${perHourSql(x, 'rare_kills')} AS rareKillsPerHour
         FROM ${table} ${x}
         ${whereClause}
         GROUP BY name`
      )
      .all(params) as unknown as Omit<RareEntryRow, 'origin'>[]
  ).map((row) => ({ ...row, origin: source.origin }));

  const timeline = db
    .prepare(
      `SELECT ${bucketExpression(x, filter.bucket)} AS bucketStart, COALESCE(SUM(${x}.rare_kills), 0) AS rareKills
       FROM ${table} ${x}
       ${whereClause}
       GROUP BY bucketStart`
    )
    .all(params) as unknown as { bucketStart: string; rareKills: number }[];

  // With a player filter, only that player's own enemy rows count (same rule
  // as computeRareKills): a party export lists each kill under whoever got it.
  const ownRows = filter.player ? 'ed.player_id = @player' : '1 = 1';

  const events = (
    db
      .prepare(
        `SELECT ed.id AS rowId, ${x}.id AS entryId, ${x}.${nameColumn} AS entryName, ${x}.start_time AS startTime,
                ed.enemy AS enemy, ed.count AS count, ${source.nightmareCrystalColumn} AS fromNightmareCrystal
         FROM ${enemiesTable} ed
         JOIN ${table} ${x} ON ${x}.id = ed.${foreignKey}
         ${and(whereClause, `ed.rare = 1 AND ${ownRows}`)}`
      )
      .all(params) as any[]
  ).map((row) => ({
    ...row,
    // The session id is part of the key so it has the same shape as in
    // standalone mode, where enemy rows are numbered from 1 in each document.
    id: `${source.origin}-${row.entryId}-${row.rowId}`,
    enemy: canonicalEnemyName(row.enemy),
    origin: source.origin,
    fromNightmareCrystal: !!row.fromNightmareCrystal,
  }));

  const crystals =
    source.origin === 'hunt'
      ? (db
          .prepare(
            `SELECT COALESCE(SUM(ed.count), 0) AS broken
             FROM ${enemiesTable} ed
             JOIN ${table} ${x} ON ${x}.id = ed.${foreignKey}
             ${and(whereClause, `LOWER(ed.enemy) = '${NIGHTMARE_CRYSTAL_ENEMY}' AND ${ownRows}`)}`
          )
          .get(params) as { broken: number })
      : { broken: 0 };

  return {
    ...totals,
    nightmareCrystalsBroken: crystals.broken,
    byEntry,
    timeline,
    events,
  };
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR');
}

// Newest first; rows of the same session keep the export's order. Sessions
// sharing a start time are split by id before row ids are compared, since in
// standalone mode row ids only order rows WITHIN a session.
function compareEvents(a: RareEvent & { rowId: number }, b: RareEvent & { rowId: number }): number {
  if (a.startTime !== b.startTime) return a.startTime < b.startTime ? 1 : -1;
  if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
  if (a.entryId !== b.entryId) return a.entryId - b.entryId;
  return a.rowId - b.rowId;
}

function buildSpecies(events: RareEvent[]): RareSpeciesRow[] {
  const groups = new Map<string, { row: RareSpeciesRow; names: Map<string, number> }>();
  for (const event of events) {
    let group = groups.get(event.enemy);
    if (!group) {
      group = {
        row: { enemy: event.enemy, origins: [], count: 0, nightmareCrystalCount: 0, lastAt: event.startTime, entryNames: [] },
        names: new Map(),
      };
      groups.set(event.enemy, group);
    }
    const { row, names } = group;
    if (!row.origins.includes(event.origin)) row.origins.push(event.origin);
    row.count += event.count;
    if (event.fromNightmareCrystal) row.nightmareCrystalCount += event.count;
    if (event.startTime > row.lastAt) row.lastAt = event.startTime;
    // Tallied in kills, not sessions: "3 of these came from Sandaconda".
    const entryName = event.entryName ?? 'Sem nome';
    names.set(entryName, (names.get(entryName) ?? 0) + event.count);
  }

  return [...groups.values()]
    .map(({ row, names }) => ({
      ...row,
      origins: (['hunt', 'md'] as RareOrigin[]).filter((o) => row.origins.includes(o)),
      entryNames: [...names.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || compareNames(a.name, b.name)),
    }))
    .sort((a, b) => b.count - a.count || compareNames(a.enemy, b.enemy));
}

// Highest Raros/h first; entries with no duration (no rate) go last, like
// SQLite's DESC ordering puts NULLs.
function compareEntries(a: RareEntryRow, b: RareEntryRow): number {
  if (a.rareKillsPerHour !== b.rareKillsPerHour) {
    if (a.rareKillsPerHour === null) return 1;
    if (b.rareKillsPerHour === null) return -1;
    return b.rareKillsPerHour - a.rareKillsPerHour;
  }
  return b.rareKills - a.rareKills || compareNames(a.name, b.name) || (a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0);
}

export function computeRares(filter: RaresFilterQuery): RaresSummary {
  const origins: RareOrigin[] = filter.origin === 'hunt' || filter.origin === 'md' ? [filter.origin] : ['hunt', 'md'];
  const data = origins.map((origin) => loadOrigin(SOURCES[origin], filter));

  const total = (pick: (d: OriginData) => number) => data.reduce((acc, d) => acc + pick(d), 0);
  const totalRareKills = total((d) => d.rareKills);
  const totalDurationSeconds = total((d) => d.durationSeconds);

  const sortedEvents = data.flatMap((d) => d.events).sort(compareEvents);
  const events: RareEvent[] = sortedEvents.map(({ rowId: _rowId, ...event }) => event);

  // Buckets come from sessions, not rares, so a week of hunting with no rare
  // still shows up as a zero bar instead of a gap.
  const timelineMap = new Map<string, RareTimelinePoint>();
  data.forEach((d, i) => {
    for (const point of d.timeline) {
      const entry = timelineMap.get(point.bucketStart) ?? { bucketStart: point.bucketStart, hunt: 0, md: 0 };
      entry[origins[i]] += point.rareKills;
      timelineMap.set(point.bucketStart, entry);
    }
  });

  return {
    totalRareKills,
    identifiedRareKills: events.reduce((acc, e) => acc + e.count, 0),
    unidentifiedRareKills: total((d) => d.unidentifiedRareKills),
    totalDurationSeconds,
    rareKillsPerHour: totalDurationSeconds ? (totalRareKills * 3600) / totalDurationSeconds : null,
    sessions: total((d) => d.sessions),
    sessionsWithRares: total((d) => d.sessionsWithRares),
    nightmareCrystalRares: events.reduce((acc, e) => acc + (e.fromNightmareCrystal ? e.count : 0), 0),
    nightmareCrystalsBroken: total((d) => d.nightmareCrystalsBroken),
    lastRare: events[0] ?? null,
    species: buildSpecies(events),
    byEntry: data.flatMap((d) => d.byEntry).sort(compareEntries),
    timeline: [...timelineMap.values()].sort((a, b) => (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0)),
    events,
  };
}
