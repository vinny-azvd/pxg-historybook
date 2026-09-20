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
  mostProfitableHunt: { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  leastProfitableHunt: { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  mostFrequentHunt: { huntName: string; count: number } | null;
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
      `SELECT h.id, h.hunt_name AS huntName, h.profit, h.profit_per_hour AS profitPerHour, h.start_time AS startTime
       FROM hunts h
       ${whereClause}
       ORDER BY h.profit DESC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string }
    | undefined;

  const leastProfitable = db
    .prepare(
      `SELECT h.id, h.hunt_name AS huntName, h.profit, h.profit_per_hour AS profitPerHour, h.start_time AS startTime
       FROM hunts h
       ${whereClause}
       ORDER BY h.profit ASC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string }
    | undefined;

  const nameWhereClause = whereClause
    ? `${whereClause} AND h.hunt_name IS NOT NULL`
    : 'WHERE h.hunt_name IS NOT NULL';

  const mostFrequent = db
    .prepare(
      `SELECT h.hunt_name AS huntName, COUNT(*) AS count
       FROM hunts h
       ${nameWhereClause}
       GROUP BY h.hunt_name
       ORDER BY count DESC, MAX(h.start_time) DESC
       LIMIT 1`
    )
    .get(params) as { huntName: string; count: number } | undefined;

  return {
    ...aggregates,
    mostProfitableHunt: mostProfitable ?? null,
    leastProfitableHunt: leastProfitable ?? null,
    mostFrequentHunt: mostFrequent ?? null,
  };
}

const BUCKET_EXPRESSIONS: Record<string, string> = {
  day: "date(h.start_time)",
  week: "date(h.start_time, 'weekday 0', '-6 days')",
  month: "strftime('%Y-%m-01', h.start_time)",
};

export function computeAvailableMonths(filter: Pick<HuntFilterQuery, 'player' | 'sessionType'>) {
  const { whereClause, params } = buildHuntFilter(filter);
  return db
    .prepare(
      `SELECT strftime('%Y-%m', h.start_time) AS month, COUNT(*) AS huntCount
       FROM hunts h
       ${whereClause}
       GROUP BY month
       ORDER BY month DESC`
    )
    .all(params) as { month: string; huntCount: number }[];
}

export function computeTrends(filter: HuntFilterQuery, bucket: string) {
  const { whereClause, params } = buildHuntFilter(filter);

  if (bucket === 'hunt') {
    const rows = db
      .prepare(
        `SELECT h.id AS huntId, h.hunt_name AS huntName, h.start_time AS bucketStart,
                1 AS huntCount, h.profit AS totalProfit, h.profit_per_hour AS avgProfitPerHour,
                h.kills_per_hour AS avgKillsPerHour, h.rare_kills_per_hour AS avgRareKillsPerHour,
                h.experience_per_hour AS avgExperiencePerHour, h.supplies_per_hour AS avgSuppliesPerHour,
                h.jade_totem_count AS jadeTotemCount,
                CASE WHEN h.jade_totem_count > 0 AND (h.jade_totem_count * 3600) < h.duration_seconds THEN 1 ELSE 0 END AS jadeSevere,
                (SELECT GROUP_CONCAT(td.item || '::' || td.unit_price, '||')
                   FROM (SELECT item, unit_price FROM hunt_drops WHERE hunt_id = h.id AND (ignored IS NULL OR ignored = 0)
                         ORDER BY unit_price DESC LIMIT 5) td) AS topDropsRaw
         FROM hunts h
         ${whereClause}
         ORDER BY h.start_time ASC`
      )
      .all(params) as any[];

    return rows.map((row) => ({
      ...row,
      jadeSevere: !!row.jadeSevere,
      topDrops: row.topDropsRaw
        ? row.topDropsRaw.split('||').map((entry: string) => {
            const [item, unitPrice] = entry.split('::');
            return { item, unitPrice: Number(unitPrice) };
          })
        : [],
      topDropsRaw: undefined,
    }));
  }

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
