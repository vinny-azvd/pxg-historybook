// Ported from apps/backend/src/services/terrorStatsAggregation.ts. Terror
// has no hourly-rate framing (it's a weekly rotation, not an ongoing grind),
// no jade/Nightmare Crystal fields, and no /compare endpoint (confirmed by
// reading routes/terrorStats.ts - no such route exists); it does add a
// weekly-groups view and an avgNightmareTokens aggregate hunts don't have.
import type { PlayerTrendPoint, TerrorOverviewStats, TerrorWeeklyResponse, TrendPoint } from '../../types';
import type { StoredTerror } from '../storedTypes';
import {
  avg,
  bucketFn,
  bucketWeek,
  buildFilterPredicate,
  dateOnly,
  extremeByProfit,
  type FilterQuery,
  maxOf,
  mostFrequentName,
  sum,
  topDrops,
} from './shared';

export function computeOverview(terrors: StoredTerror[], filter: FilterQuery): TerrorOverviewStats {
  const filtered = terrors.filter(buildFilterPredicate<StoredTerror>(filter));

  const mostProfitableDoc = extremeByProfit(filtered, 'max');
  const leastProfitableDoc = extremeByProfit(filtered, 'min');
  const mostFrequent = mostFrequentName(filtered, (t) => t.terror_name);

  const nightmareTokensPerTerror = filtered.map((t) =>
    sum(
      t.supplies.filter((s) => s.item_normalized === 'nightmare token'),
      (s) => s.count
    )
  );

  return {
    terrorCount: filtered.length,
    totalProfit: sum(filtered, (t) => t.profit),
    avgProfit: avg(filtered, (t) => t.profit),
    maxProfit: maxOf(filtered, (t) => t.profit),
    avgExperience: avg(filtered, (t) => t.experience),
    totalExperience: sum(filtered, (t) => t.experience),
    avgNightmareTokens:
      nightmareTokensPerTerror.length === 0
        ? null
        : nightmareTokensPerTerror.reduce((a, b) => a + b, 0) / nightmareTokensPerTerror.length,
    mostProfitableTerror: mostProfitableDoc
      ? {
          id: mostProfitableDoc.id,
          terrorName: mostProfitableDoc.terror_name,
          profit: mostProfitableDoc.profit,
          profitPerHour: mostProfitableDoc.profit_per_hour,
          startTime: mostProfitableDoc.start_time,
          players: mostProfitableDoc.players.map((p) => p.name),
        }
      : null,
    leastProfitableTerror: leastProfitableDoc
      ? {
          id: leastProfitableDoc.id,
          terrorName: leastProfitableDoc.terror_name,
          profit: leastProfitableDoc.profit,
          profitPerHour: leastProfitableDoc.profit_per_hour,
          startTime: leastProfitableDoc.start_time,
          players: leastProfitableDoc.players.map((p) => p.name),
        }
      : null,
    mostFrequentTerror: mostFrequent ? { terrorName: mostFrequent.name, count: mostFrequent.count } : null,
  };
}

export function computeWeeklyGroups(
  terrors: StoredTerror[],
  filter: FilterQuery,
  page: number,
  pageSize: number
): TerrorWeeklyResponse {
  const filtered = terrors.filter(buildFilterPredicate<StoredTerror>(filter));
  const groups = new Map<string, StoredTerror[]>();
  for (const t of filtered) {
    const key = bucketWeek(dateOnly(t.start_time));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const allWeeksDesc = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  const total = allWeeksDesc.length;
  const offset = (page - 1) * pageSize;
  const items = allWeeksDesc.slice(offset, offset + pageSize).map(([weekStart, docs]) => ({
    weekStart,
    terrorCount: docs.length,
    totalProfit: sum(docs, (t) => t.profit),
    avgProfit: avg(docs, (t) => t.profit),
  }));

  return { items, total };
}

export function computeTrends(terrors: StoredTerror[], filter: FilterQuery, bucket: string): TrendPoint[] {
  const filtered = terrors.filter(buildFilterPredicate<StoredTerror>(filter));

  // Note: unlike hunts' per-hunt/bucketed rows, the backend's terror trend
  // queries never select profit_per_hour/kills_per_hour/etc in either branch
  // (only the plain, non-hourly aggregates) - those *PerHour fields are set
  // to null here to match, not left defaulting to a hunt-shaped value.
  if (bucket === 'terror') {
    return [...filtered]
      .sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0))
      .map((t) => ({
        huntId: t.id,
        huntName: t.terror_name,
        bucketStart: t.start_time,
        huntCount: 1,
        totalProfit: t.profit,
        avgProfitPerHour: null,
        avgKillsPerHour: null,
        avgRareKillsPerHour: null,
        avgExperiencePerHour: null,
        avgSuppliesPerHour: null,
        avgProfit: t.profit,
        avgKills: t.kills,
        avgRareKills: t.rare_kills,
        avgExperience: t.experience,
        avgSupplies: t.supplies_cost,
        topDrops: topDrops(t.drops),
      }));
  }

  const toBucket = bucketFn(bucket);
  const groups = new Map<string, StoredTerror[]>();
  for (const t of filtered) {
    const key = toBucket(dateOnly(t.start_time));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([bucketStart, docs]) => ({
      bucketStart,
      huntCount: docs.length,
      totalProfit: sum(docs, (t) => t.profit),
      avgProfitPerHour: null,
      avgKillsPerHour: null,
      avgRareKillsPerHour: null,
      avgExperiencePerHour: null,
      avgSuppliesPerHour: null,
      avgProfit: avg(docs, (t) => t.profit),
      avgKills: avg(docs, (t) => t.kills),
      avgRareKills: avg(docs, (t) => t.rare_kills),
      avgExperience: avg(docs, (t) => t.experience),
      avgSupplies: avg(docs, (t) => t.supplies_cost),
    }));
}

export function computeTrendsByPlayer(terrors: StoredTerror[], filter: FilterQuery, bucket: string): PlayerTrendPoint[] {
  const filtered = terrors.filter(buildFilterPredicate<StoredTerror>(filter));

  if (bucket === 'terror') {
    const rows: PlayerTrendPoint[] = [];
    for (const t of filtered) {
      for (const p of t.players) {
        rows.push({
          playerId: p.id,
          playerName: p.name,
          huntId: t.id,
          huntName: t.terror_name,
          bucketStart: t.start_time,
          huntCount: 1,
          totalProfit: t.profit,
          avgProfitPerHour: null,
          avgKillsPerHour: null,
          avgRareKillsPerHour: null,
          avgExperiencePerHour: null,
          avgSuppliesPerHour: null,
          avgProfit: t.profit,
          avgExperience: t.experience,
          avgSupplies: t.supplies_cost,
        });
      }
    }
    rows.sort((a, b) => a.playerId - b.playerId || (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0));
    return rows;
  }

  const toBucket = bucketFn(bucket);
  const groups = new Map<string, { playerId: number; playerName: string; docs: StoredTerror[] }>();
  for (const t of filtered) {
    const key = toBucket(dateOnly(t.start_time));
    for (const p of t.players) {
      const groupKey = `${p.id}::${key}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { playerId: p.id, playerName: p.name, docs: [] });
      groups.get(groupKey)!.docs.push(t);
    }
  }

  return [...groups.entries()]
    .map(([groupKey, g]) => ({
      playerId: g.playerId,
      playerName: g.playerName,
      bucketStart: groupKey.slice(groupKey.indexOf('::') + 2),
      huntCount: g.docs.length,
      totalProfit: sum(g.docs, (t) => t.profit),
      avgProfitPerHour: avg(g.docs, (t) => t.profit),
      avgKillsPerHour: null,
      avgRareKillsPerHour: null,
      avgExperiencePerHour: null,
      avgSuppliesPerHour: null,
      avgProfit: avg(g.docs, (t) => t.profit),
      avgExperience: avg(g.docs, (t) => t.experience),
      avgSupplies: avg(g.docs, (t) => t.supplies_cost),
    }))
    .sort((a, b) => a.playerId - b.playerId || (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0));
}
