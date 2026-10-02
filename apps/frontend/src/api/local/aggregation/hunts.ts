// Ported from apps/backend/src/services/statsAggregation.ts and the
// `/compare` delta logic inline in apps/backend/src/routes/stats.ts (hunts
// only - confirmed terrorStats.ts/mdStats.ts routers have no /compare).
import type { CompareDelta, CompareResponse, MonthBucket, OverviewStats, PlayerTrendPoint, RareKillRow, TrendPoint } from '../../types';
import type { StoredHunt } from '../storedTypes';
import {
  avg,
  bucketFn,
  buildFilterPredicate,
  dateOnly,
  extremeByProfit,
  type FilterQuery,
  jadeSevere,
  maxOf,
  mostFrequentName,
  sum,
  topDrops,
} from './shared';

export function computeOverview(hunts: StoredHunt[], filter: FilterQuery): OverviewStats {
  const filtered = hunts.filter(buildFilterPredicate<StoredHunt>(filter));

  const mostProfitableDoc = extremeByProfit(filtered, 'max');
  const leastProfitableDoc = extremeByProfit(filtered, 'min');
  const mostFrequent = mostFrequentName(filtered, (h) => h.hunt_name);

  return {
    huntCount: filtered.length,
    totalDurationSeconds: sum(filtered, (h) => h.duration_seconds),
    totalProfit: sum(filtered, (h) => h.profit),
    avgProfitPerHour: avg(filtered, (h) => h.profit_per_hour),
    maxProfitPerHour: maxOf(filtered, (h) => h.profit_per_hour),
    totalKills: sum(filtered, (h) => h.kills),
    avgKillsPerHour: avg(filtered, (h) => h.kills_per_hour),
    maxKillsPerHour: maxOf(filtered, (h) => h.kills_per_hour),
    maxKills: maxOf(filtered, (h) => h.kills),
    totalRareKills: sum(filtered, (h) => h.rare_kills),
    avgRareKillsPerHour: avg(filtered, (h) => h.rare_kills_per_hour),
    maxRareKillsPerHour: maxOf(filtered, (h) => h.rare_kills_per_hour),
    maxRareKills: maxOf(filtered, (h) => h.rare_kills),
    avgExperiencePerHour: avg(filtered, (h) => h.experience_per_hour),
    avgSuppliesPerHour: avg(filtered, (h) => h.supplies_per_hour),
    avgDamageDealtPerSecond: avg(filtered, (h) => h.damage_dealt_per_second),
    avgDamageTakenPerSecond: avg(filtered, (h) => h.damage_taken_per_second),
    totalExperience: sum(filtered, (h) => h.experience),
    mostProfitableHunt: mostProfitableDoc
      ? {
          id: mostProfitableDoc.id,
          huntName: mostProfitableDoc.hunt_name,
          profit: mostProfitableDoc.profit,
          profitPerHour: mostProfitableDoc.profit_per_hour,
          startTime: mostProfitableDoc.start_time,
          players: mostProfitableDoc.players.map((p) => p.name),
        }
      : null,
    leastProfitableHunt: leastProfitableDoc
      ? {
          id: leastProfitableDoc.id,
          huntName: leastProfitableDoc.hunt_name,
          profit: leastProfitableDoc.profit,
          profitPerHour: leastProfitableDoc.profit_per_hour,
          startTime: leastProfitableDoc.start_time,
          players: leastProfitableDoc.players.map((p) => p.name),
        }
      : null,
    mostFrequentHunt: mostFrequent ? { huntName: mostFrequent.name, count: mostFrequent.count } : null,
  };
}

export function computeRareKills(hunts: StoredHunt[], filter: FilterQuery): RareKillRow[] {
  const filtered = hunts.filter(buildFilterPredicate<StoredHunt>(filter));
  const rows: RareKillRow[] = [];
  for (const hunt of filtered) {
    for (const ed of hunt.enemies_defeated) {
      if (ed.rare === 1) {
        rows.push({
          id: ed.id,
          huntId: hunt.id,
          huntName: hunt.hunt_name,
          startTime: hunt.start_time,
          enemy: ed.enemy,
          count: ed.count,
          fromNightmareCrystal: !!ed.from_nightmare_crystal,
        });
      }
    }
  }
  rows.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? 1 : -1; // DESC
    return a.id - b.id; // ASC
  });
  return rows;
}

export function computeAvailableMonths(
  hunts: StoredHunt[],
  filter: Pick<FilterQuery, 'player' | 'sessionType'>
): MonthBucket[] {
  const filtered = hunts.filter(buildFilterPredicate<StoredHunt>(filter));
  const groups = new Map<string, number>();
  for (const h of filtered) {
    const month = h.start_time.slice(0, 7);
    groups.set(month, (groups.get(month) ?? 0) + 1);
  }
  return [...groups.entries()]
    .map(([month, huntCount]) => ({ month, huntCount }))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}

export function computeTrends(hunts: StoredHunt[], filter: FilterQuery, bucket: string): TrendPoint[] {
  const filtered = hunts.filter(buildFilterPredicate<StoredHunt>(filter));

  if (bucket === 'hunt') {
    return [...filtered]
      .sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0))
      .map((h) => ({
        huntId: h.id,
        huntName: h.hunt_name,
        bucketStart: h.start_time,
        huntCount: 1,
        totalProfit: h.profit,
        avgProfitPerHour: h.profit_per_hour,
        avgKillsPerHour: h.kills_per_hour,
        avgRareKillsPerHour: h.rare_kills_per_hour,
        avgExperiencePerHour: h.experience_per_hour,
        avgSuppliesPerHour: h.supplies_per_hour,
        jadeTotemCount: h.jade_totem_count,
        jadeSevere: jadeSevere(h),
        topDrops: topDrops(h.drops),
      }));
  }

  const toBucket = bucketFn(bucket);
  const groups = new Map<string, StoredHunt[]>();
  for (const h of filtered) {
    const key = toBucket(dateOnly(h.start_time));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(h);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([bucketStart, docs]) => ({
      bucketStart,
      huntCount: docs.length,
      totalProfit: sum(docs, (h) => h.profit),
      avgProfitPerHour: avg(docs, (h) => h.profit_per_hour),
      avgKillsPerHour: avg(docs, (h) => h.kills_per_hour),
      avgRareKillsPerHour: avg(docs, (h) => h.rare_kills_per_hour),
      avgExperiencePerHour: avg(docs, (h) => h.experience_per_hour),
      avgSuppliesPerHour: avg(docs, (h) => h.supplies_per_hour),
    }));
}

export function computeTrendsByPlayer(hunts: StoredHunt[], filter: FilterQuery, bucket: string): PlayerTrendPoint[] {
  const filtered = hunts.filter(buildFilterPredicate<StoredHunt>(filter));

  if (bucket === 'hunt') {
    const rows: PlayerTrendPoint[] = [];
    for (const h of filtered) {
      for (const p of h.players) {
        rows.push({
          playerId: p.id,
          playerName: p.name,
          huntId: h.id,
          huntName: h.hunt_name,
          bucketStart: h.start_time,
          huntCount: 1,
          totalProfit: h.profit,
          avgProfitPerHour: h.profit_per_hour,
          avgKillsPerHour: h.kills_per_hour,
          avgRareKillsPerHour: h.rare_kills_per_hour,
          avgExperiencePerHour: h.experience_per_hour,
          avgSuppliesPerHour: h.supplies_per_hour,
        });
      }
    }
    rows.sort((a, b) => a.playerId - b.playerId || (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0));
    return rows;
  }

  const toBucket = bucketFn(bucket);
  const groups = new Map<string, { playerId: number; playerName: string; docs: StoredHunt[] }>();
  for (const h of filtered) {
    const key = toBucket(dateOnly(h.start_time));
    for (const p of h.players) {
      const groupKey = `${p.id}::${key}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { playerId: p.id, playerName: p.name, docs: [] });
      groups.get(groupKey)!.docs.push(h);
    }
  }

  return [...groups.entries()]
    .map(([groupKey, g]) => ({
      playerId: g.playerId,
      playerName: g.playerName,
      bucketStart: groupKey.slice(groupKey.indexOf('::') + 2),
      huntCount: g.docs.length,
      totalProfit: sum(g.docs, (h) => h.profit),
      avgProfitPerHour: avg(g.docs, (h) => h.profit_per_hour),
      avgKillsPerHour: avg(g.docs, (h) => h.kills_per_hour),
      avgRareKillsPerHour: avg(g.docs, (h) => h.rare_kills_per_hour),
      avgExperiencePerHour: avg(g.docs, (h) => h.experience_per_hour),
      avgSuppliesPerHour: avg(g.docs, (h) => h.supplies_per_hour),
    }))
    .sort((a, b) => a.playerId - b.playerId || (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0));
}

export function computeCompare(
  hunts: StoredHunt[],
  params: {
    player?: string;
    sessionType?: string;
    periodA: { from?: string; to?: string };
    periodB: { from?: string; to?: string };
  }
): CompareResponse {
  const statsA = computeOverview(hunts, {
    player: params.player,
    sessionType: params.sessionType,
    from: params.periodA.from,
    to: params.periodA.to,
  });
  const statsB = computeOverview(hunts, {
    player: params.player,
    sessionType: params.sessionType,
    from: params.periodB.from,
    to: params.periodB.to,
  });

  const delta = (a: number | null, b: number | null): CompareDelta | null => {
    if (a === null || b === null) return null;
    return { diff: b - a, percent: a === 0 ? null : ((b - a) / Math.abs(a)) * 100 };
  };

  return {
    periodA: { range: params.periodA, stats: statsA },
    periodB: { range: params.periodB, stats: statsB },
    delta: {
      avgProfitPerHour: delta(statsA.avgProfitPerHour, statsB.avgProfitPerHour),
      avgKillsPerHour: delta(statsA.avgKillsPerHour, statsB.avgKillsPerHour),
      avgRareKillsPerHour: delta(statsA.avgRareKillsPerHour, statsB.avgRareKillsPerHour),
      avgExperiencePerHour: delta(statsA.avgExperiencePerHour, statsB.avgExperiencePerHour),
      totalProfit: delta(statsA.totalProfit, statsB.totalProfit),
    },
  };
}
