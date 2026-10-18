// Ported from apps/backend/src/services/raresAggregation.ts - see there for
// why totals come from session `rare_kills` while species/events come from
// the per-enemy rare rows, and how the "unidentified" gap is measured.
import type { RareEntryRow, RareEvent, RareOrigin, RareSpeciesRow, RaresFilters, RaresSummary, RareTimelinePoint } from '../../types';
import type { StoredEnemyDefeatedRow, StoredHunt, StoredMd, StoredShinyLegacy } from '../storedTypes';
import { canonicalEnemyName } from '../../../enemyNames';
import { filterLegacy, legacyHuntName, legacyRareRows } from './legacy';
import { bucketFn, buildFilterPredicate, dateOnly, perHour, sum } from './shared';

/** Name of the "crystal" enemy row a broken Nightmare Crystal leaves behind
 * in hunt exports - not a rare itself, but it's how many crystals were used. */
const NIGHTMARE_CRYSTAL_ENEMY = 'nightmare crystal';

interface RareSession {
  id: number;
  name: string | null;
  start_time: string;
  duration_seconds: number;
  rare_kills: number;
  enemies_defeated: (StoredEnemyDefeatedRow & { from_nightmare_crystal?: number })[];
  /** A record of the old roulette's history, not a hunt: its id is not a hunt id. */
  legacy?: boolean;
}

interface OriginData {
  sessions: number;
  sessionsWithRares: number;
  rareKills: number;
  durationSeconds: number;
  unidentifiedRareKills: number;
  nightmareCrystalsBroken: number;
  byEntry: RareEntryRow[];
  timeline: Map<string, { rareKills: number; durationSeconds: number }>;
  events: (RareEvent & { rowId: number })[];
}

function loadOrigin(origin: RareOrigin, sessions: RareSession[], filter: RaresFilters): OriginData {
  const playerId = filter.player ? Number(filter.player) : undefined;
  // With a player filter, only that player's own enemy rows count (same rule
  // as computeRareKills): a party export lists each kill under whoever got it.
  const ownRow = (row: StoredEnemyDefeatedRow) => playerId === undefined || row.player_id === playerId;

  const groups = new Map<string, RareSession[]>();
  const timeline = new Map<string, { rareKills: number; durationSeconds: number }>();
  const toBucket = bucketFn(filter.bucket);
  const events: (RareEvent & { rowId: number })[] = [];
  let unidentifiedRareKills = 0;
  let nightmareCrystalsBroken = 0;

  for (const session of sessions) {
    const name = session.name ?? 'Sem nome';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(session);

    const bucketStart = toBucket(dateOnly(session.start_time));
    // Time per bucket too: a count per day/week/month can't be compared
    // without the hours played in it.
    const slot = timeline.get(bucketStart) ?? { rareKills: 0, durationSeconds: 0 };
    slot.rareKills += session.rare_kills;
    slot.durationSeconds += session.duration_seconds;
    timeline.set(bucketStart, slot);

    // Against ALL of the session's rare rows, whoever got the kill - see the
    // backend's unidentifiedRareKills.
    const listed = sum(
      session.enemies_defeated.filter((row) => row.rare === 1),
      (row) => row.count
    );
    unidentifiedRareKills += Math.max(session.rare_kills - listed, 0);

    for (const row of session.enemies_defeated) {
      if (!ownRow(row)) continue;
      if (row.rare === 1) {
        events.push({
          rowId: row.id,
          // Enemy row ids restart at 1 in every document (ingest.ts), so the
          // session id is what makes this unique - same shape as the backend.
          id: `${session.legacy ? 'legacy' : origin}-${session.id}-${row.id}`,
          origin,
          entryId: session.id,
          entryName: session.name,
          startTime: session.start_time,
          enemy: canonicalEnemyName(row.enemy),
          count: row.count,
          fromNightmareCrystal: !!row.from_nightmare_crystal,
          ...(session.legacy ? { legacy: true } : {}),
        });
      }
      if (origin === 'hunt' && row.enemy.toLowerCase() === NIGHTMARE_CRYSTAL_ENEMY) nightmareCrystalsBroken += row.count;
    }
  }

  return {
    sessions: sessions.length,
    sessionsWithRares: sessions.filter((s) => s.rare_kills > 0).length,
    rareKills: sum(sessions, (s) => s.rare_kills),
    durationSeconds: sum(sessions, (s) => s.duration_seconds),
    unidentifiedRareKills,
    nightmareCrystalsBroken,
    byEntry: [...groups.entries()].map(([name, group]) => ({
      name,
      origin,
      sessions: group.length,
      rareKills: sum(group, (s) => s.rare_kills),
      durationSeconds: sum(group, (s) => s.duration_seconds),
      rareKillsPerHour: perHour(group, (s) => s.rare_kills),
    })),
    timeline,
    events,
  };
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR');
}

// Newest first; rows of the same session keep the export's order. Row ids
// only order rows WITHIN a document here, so sessions sharing a start time
// are split by id first (same order as the backend).
function compareEvents(a: RareEvent & { rowId: number }, b: RareEvent & { rowId: number }): number {
  if (a.startTime !== b.startTime) return a.startTime < b.startTime ? 1 : -1;
  if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
  if (!!a.legacy !== !!b.legacy) return a.legacy ? 1 : -1;
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

export function computeRares(
  hunts: StoredHunt[],
  mds: StoredMd[],
  legacy: StoredShinyLegacy[],
  filter: RaresFilters
): RaresSummary {
  const origins: RareOrigin[] = filter.origin === 'hunt' || filter.origin === 'md' ? [filter.origin] : ['hunt', 'md'];
  const sessionsOf = (origin: RareOrigin): RareSession[] =>
    origin === 'hunt'
      ? [
          ...hunts.filter(buildFilterPredicate<StoredHunt>(filter)).map((h) => ({ ...h, name: h.hunt_name })),
          // The old roulette's history counts as hunts here: its shinies are rares too.
          ...filterLegacy(legacy, filter).map(
            (r): RareSession => ({
              id: r.id,
              name: legacyHuntName(r),
              start_time: r.start_time,
              duration_seconds: r.duration_seconds,
              rare_kills: r.shinies + (r.companion ? r.companion_shinies : 0),
              enemies_defeated: legacyRareRows(r),
              legacy: true,
            })
          ),
        ]
      : mds.filter(buildFilterPredicate<StoredMd>(filter)).map((m) => ({ ...m, name: m.md_name }));
  const data = origins.map((origin) => loadOrigin(origin, sessionsOf(origin), filter));

  const total = (pick: (d: OriginData) => number) => sum(data, pick);
  const totalRareKills = total((d) => d.rareKills);
  const totalDurationSeconds = total((d) => d.durationSeconds);

  const sortedEvents = data.flatMap((d) => d.events).sort(compareEvents);
  const events: RareEvent[] = sortedEvents.map(({ rowId: _rowId, ...event }) => event);

  // Buckets come from sessions, not rares, so a week of hunting with no rare
  // still shows up as a zero bar instead of a gap.
  const timelineMap = new Map<string, RareTimelinePoint>();
  data.forEach((d, i) => {
    for (const [bucketStart, slot] of d.timeline) {
      const entry = timelineMap.get(bucketStart) ?? { bucketStart, hunt: 0, md: 0, durationSeconds: 0 };
      entry[origins[i]] += slot.rareKills;
      entry.durationSeconds += slot.durationSeconds;
      timelineMap.set(bucketStart, entry);
    }
  });

  return {
    totalRareKills,
    identifiedRareKills: sum(events, (e) => e.count),
    unidentifiedRareKills: total((d) => d.unidentifiedRareKills),
    totalDurationSeconds,
    rareKillsPerHour: totalDurationSeconds ? (totalRareKills * 3600) / totalDurationSeconds : null,
    sessions: total((d) => d.sessions),
    sessionsWithRares: total((d) => d.sessionsWithRares),
    nightmareCrystalRares: sum(events, (e) => (e.fromNightmareCrystal ? e.count : 0)),
    nightmareCrystalsBroken: total((d) => d.nightmareCrystalsBroken),
    lastRare: events[0] ?? null,
    species: buildSpecies(events),
    byEntry: data.flatMap((d) => d.byEntry).sort(compareEntries),
    timeline: [...timelineMap.values()].sort((a, b) => (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0)),
    events,
  };
}
