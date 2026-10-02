// Ported from apps/backend/src/services/mdStatsAggregation.ts. Framed like
// Terror (totals/per-run averages, no hourly rates, no /compare endpoint -
// confirmed no such route in routes/mdStats.ts), but without Terror's
// avgNightmareTokens (MD has no fixed entry-cost supply item to track).
import type { MdOverviewStats, MdWeeklyResponse, PlayerTrendPoint, TrendPoint } from '../../types';
import type { StoredMd } from '../storedTypes';
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

export function computeOverview(mds: StoredMd[], filter: FilterQuery): MdOverviewStats {
  const filtered = mds.filter(buildFilterPredicate<StoredMd>(filter));

  const mostProfitableDoc = extremeByProfit(filtered, 'max');
  const leastProfitableDoc = extremeByProfit(filtered, 'min');
  const mostFrequent = mostFrequentName(filtered, (m) => m.md_name);

  return {
    mdCount: filtered.length,
    totalProfit: sum(filtered, (m) => m.profit),
    avgProfit: avg(filtered, (m) => m.profit),
    maxProfit: maxOf(filtered, (m) => m.profit),
    avgExperience: avg(filtered, (m) => m.experience),
    totalExperience: sum(filtered, (m) => m.experience),
    mostProfitableMd: mostProfitableDoc
      ? {
          id: mostProfitableDoc.id,
          mdName: mostProfitableDoc.md_name,
          profit: mostProfitableDoc.profit,
          profitPerHour: mostProfitableDoc.profit_per_hour,
          startTime: mostProfitableDoc.start_time,
          players: mostProfitableDoc.players.map((p) => p.name),
        }
      : null,
    leastProfitableMd: leastProfitableDoc
      ? {
          id: leastProfitableDoc.id,
          mdName: leastProfitableDoc.md_name,
          profit: leastProfitableDoc.profit,
          profitPerHour: leastProfitableDoc.profit_per_hour,
          startTime: leastProfitableDoc.start_time,
          players: leastProfitableDoc.players.map((p) => p.name),
        }
      : null,
    mostFrequentMd: mostFrequent ? { mdName: mostFrequent.name, count: mostFrequent.count } : null,
  };
}

export function computeWeeklyGroups(
  mds: StoredMd[],
  filter: FilterQuery,
  page: number,
  pageSize: number
): MdWeeklyResponse {
  const filtered = mds.filter(buildFilterPredicate<StoredMd>(filter));
  const groups = new Map<string, StoredMd[]>();
  for (const m of filtered) {
    const key = bucketWeek(dateOnly(m.start_time));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const allWeeksDesc = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  const total = allWeeksDesc.length;
  const offset = (page - 1) * pageSize;
  const items = allWeeksDesc.slice(offset, offset + pageSize).map(([weekStart, docs]) => ({
    weekStart,
    mdCount: docs.length,
    totalProfit: sum(docs, (m) => m.profit),
    avgProfit: avg(docs, (m) => m.profit),
  }));

  return { items, total };
}

// Same as Terror: the backend's per-item/grouped MD trend queries never
// select the *PerHour columns, only the plain averages.
export function computeTrends(mds: StoredMd[], filter: FilterQuery, bucket: string): TrendPoint[] {
  const filtered = mds.filter(buildFilterPredicate<StoredMd>(filter));

  if (bucket === 'md') {
    return [...filtered]
      .sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0))
      .map((m) => ({
        huntId: m.id,
        huntName: m.md_name,
        bucketStart: m.start_time,
        huntCount: 1,
        totalProfit: m.profit,
        avgProfitPerHour: null,
        avgKillsPerHour: null,
        avgRareKillsPerHour: null,
        avgExperiencePerHour: null,
        avgSuppliesPerHour: null,
        avgProfit: m.profit,
        avgKills: m.kills,
        avgRareKills: m.rare_kills,
        avgExperience: m.experience,
        avgSupplies: m.supplies_cost,
        topDrops: topDrops(m.drops),
      }));
  }

  const toBucket = bucketFn(bucket);
  const groups = new Map<string, StoredMd[]>();
  for (const m of filtered) {
    const key = toBucket(dateOnly(m.start_time));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([bucketStart, docs]) => ({
      bucketStart,
      huntCount: docs.length,
      totalProfit: sum(docs, (m) => m.profit),
      avgProfitPerHour: null,
      avgKillsPerHour: null,
      avgRareKillsPerHour: null,
      avgExperiencePerHour: null,
      avgSuppliesPerHour: null,
      avgProfit: avg(docs, (m) => m.profit),
      avgKills: avg(docs, (m) => m.kills),
      avgRareKills: avg(docs, (m) => m.rare_kills),
      avgExperience: avg(docs, (m) => m.experience),
      avgSupplies: avg(docs, (m) => m.supplies_cost),
    }));
}

export function computeTrendsByPlayer(mds: StoredMd[], filter: FilterQuery, bucket: string): PlayerTrendPoint[] {
  const filtered = mds.filter(buildFilterPredicate<StoredMd>(filter));

  if (bucket === 'md') {
    const rows: PlayerTrendPoint[] = [];
    for (const m of filtered) {
      for (const p of m.players) {
        rows.push({
          playerId: p.id,
          playerName: p.name,
          huntId: m.id,
          huntName: m.md_name,
          bucketStart: m.start_time,
          huntCount: 1,
          totalProfit: m.profit,
          avgProfitPerHour: null,
          avgKillsPerHour: null,
          avgRareKillsPerHour: null,
          avgExperiencePerHour: null,
          avgSuppliesPerHour: null,
          avgProfit: m.profit,
          avgExperience: m.experience,
          avgSupplies: m.supplies_cost,
        });
      }
    }
    rows.sort((a, b) => a.playerId - b.playerId || (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0));
    return rows;
  }

  const toBucket = bucketFn(bucket);
  const groups = new Map<string, { playerId: number; playerName: string; docs: StoredMd[] }>();
  for (const m of filtered) {
    const key = toBucket(dateOnly(m.start_time));
    for (const p of m.players) {
      const groupKey = `${p.id}::${key}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { playerId: p.id, playerName: p.name, docs: [] });
      groups.get(groupKey)!.docs.push(m);
    }
  }

  return [...groups.entries()]
    .map(([groupKey, g]) => ({
      playerId: g.playerId,
      playerName: g.playerName,
      bucketStart: groupKey.slice(groupKey.indexOf('::') + 2),
      huntCount: g.docs.length,
      totalProfit: sum(g.docs, (m) => m.profit),
      avgProfitPerHour: null,
      avgKillsPerHour: null,
      avgRareKillsPerHour: null,
      avgExperiencePerHour: null,
      avgSuppliesPerHour: null,
      avgProfit: avg(g.docs, (m) => m.profit),
      avgExperience: avg(g.docs, (m) => m.experience),
      avgSupplies: avg(g.docs, (m) => m.supplies_cost),
    }))
    .sort((a, b) => a.playerId - b.playerId || (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0));
}
