import { db } from '../db/connection.js';
import { buildHuntFilter, type HuntFilterQuery } from './huntFilters.js';

export interface OverviewStats {
  huntCount: number;
  totalProfit: number;
  avgProfitPerHour: number | null;
  maxProfitPerHour: number | null;
  totalKills: number;
  avgKillsPerHour: number | null;
  maxKillsPerHour: number | null;
  maxKills: number | null;
  totalRareKills: number;
  avgRareKillsPerHour: number | null;
  maxRareKillsPerHour: number | null;
  maxRareKills: number | null;
  avgExperiencePerHour: number | null;
  avgSuppliesPerHour: number | null;
  avgDamageDealtPerSecond: number | null;
  avgDamageTakenPerSecond: number | null;
  mostProfitableHunt: { id: number; profit: number; profitPerHour: number; startTime: string } | null;
}

export function computeOverview(filter: HuntFilterQuery): OverviewStats {
  const { whereClause, params } = buildHuntFilter(filter);

  const aggregates = db
    .prepare(
      `SELECT
         COUNT(*) AS huntCount,
         COALESCE(SUM(h.profit), 0) AS totalProfit,
         AVG(h.profit_per_hour) AS avgProfitPerHour,
         MAX(h.profit_per_hour) AS maxProfitPerHour,
         COALESCE(SUM(h.kills), 0) AS totalKills,
         AVG(h.kills_per_hour) AS avgKillsPerHour,
         MAX(h.kills_per_hour) AS maxKillsPerHour,
         MAX(h.kills) AS maxKills,
         COALESCE(SUM(h.rare_kills), 0) AS totalRareKills,
         AVG(h.rare_kills_per_hour) AS avgRareKillsPerHour,
         MAX(h.rare_kills_per_hour) AS maxRareKillsPerHour,
         MAX(h.rare_kills) AS maxRareKills,
         AVG(h.experience_per_hour) AS avgExperiencePerHour,
         AVG(h.supplies_per_hour) AS avgSuppliesPerHour,
         AVG(h.damage_dealt_per_second) AS avgDamageDealtPerSecond,
         AVG(h.damage_taken_per_second) AS avgDamageTakenPerSecond
       FROM hunts h
       ${whereClause}`
    )
    .get(params) as any;

  const mostProfitable = db
    .prepare(
      `SELECT h.id, h.profit, h.profit_per_hour AS profitPerHour, h.start_time AS startTime
       FROM hunts h
       ${whereClause}
       ORDER BY h.profit DESC
       LIMIT 1`
    )
    .get(params) as { id: number; profit: number; profitPerHour: number; startTime: string } | undefined;

  return {
    ...aggregates,
    mostProfitableHunt: mostProfitable ?? null,
  };
}

const BUCKET_EXPRESSIONS: Record<string, string> = {
  day: "date(h.start_time)",
  week: "date(h.start_time, 'weekday 0', '-6 days')",
  month: "strftime('%Y-%m-01', h.start_time)",
};

export function computeTrends(filter: HuntFilterQuery, bucket: string) {
  const { whereClause, params } = buildHuntFilter(filter);
  const bucketExpr = BUCKET_EXPRESSIONS[bucket] ?? BUCKET_EXPRESSIONS.week;

  return db
    .prepare(
      `SELECT
         ${bucketExpr} AS bucketStart,
         COUNT(*) AS huntCount,
         COALESCE(SUM(h.profit), 0) AS totalProfit,
         AVG(h.profit_per_hour) AS avgProfitPerHour,
         AVG(h.kills_per_hour) AS avgKillsPerHour,
         AVG(h.rare_kills_per_hour) AS avgRareKillsPerHour,
         AVG(h.experience_per_hour) AS avgExperiencePerHour,
         AVG(h.supplies_per_hour) AS avgSuppliesPerHour
       FROM hunts h
       ${whereClause}
       GROUP BY bucketStart
       ORDER BY bucketStart ASC`
    )
    .all(params);
}
