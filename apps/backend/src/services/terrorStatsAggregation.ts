import { db } from '../db/connection.js';
import { buildTerrorFilter, type TerrorFilterQuery } from './terrorFilters.js';

export interface TerrorOverviewStats {
  terrorCount: number;
  totalDurationSeconds: number;
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
  mostProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  leastProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  mostFrequentTerror: { terrorName: string; count: number } | null;
}

export function computeTerrorOverview(filter: TerrorFilterQuery): TerrorOverviewStats {
  const { whereClause, params } = buildTerrorFilter(filter);

  const aggregates = db
    .prepare(
      `SELECT
         COUNT(*) AS terrorCount,
         COALESCE(SUM(t.duration_seconds), 0) AS totalDurationSeconds,
         COALESCE(SUM(t.profit), 0) AS totalProfit,
         AVG(t.profit_per_hour) AS avgProfitPerHour,
         MAX(t.profit_per_hour) AS maxProfitPerHour,
         COALESCE(SUM(t.kills), 0) AS totalKills,
         AVG(t.kills_per_hour) AS avgKillsPerHour,
         MAX(t.kills_per_hour) AS maxKillsPerHour,
         MAX(t.kills) AS maxKills,
         COALESCE(SUM(t.rare_kills), 0) AS totalRareKills,
         AVG(t.rare_kills_per_hour) AS avgRareKillsPerHour,
         MAX(t.rare_kills_per_hour) AS maxRareKillsPerHour,
         MAX(t.rare_kills) AS maxRareKills,
         AVG(t.experience_per_hour) AS avgExperiencePerHour,
         AVG(t.supplies_per_hour) AS avgSuppliesPerHour,
         AVG(t.damage_dealt_per_second) AS avgDamageDealtPerSecond,
         AVG(t.damage_taken_per_second) AS avgDamageTakenPerSecond
       FROM terrors t
       ${whereClause}`
    )
    .get(params) as any;

  const mostProfitable = db
    .prepare(
      `SELECT t.id, t.terror_name AS terrorName, t.profit, t.profit_per_hour AS profitPerHour, t.start_time AS startTime
       FROM terrors t
       ${whereClause}
       ORDER BY t.profit DESC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string }
    | undefined;

  const leastProfitable = db
    .prepare(
      `SELECT t.id, t.terror_name AS terrorName, t.profit, t.profit_per_hour AS profitPerHour, t.start_time AS startTime
       FROM terrors t
       ${whereClause}
       ORDER BY t.profit ASC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string }
    | undefined;

  const nameWhereClause = whereClause
    ? `${whereClause} AND t.terror_name IS NOT NULL`
    : 'WHERE t.terror_name IS NOT NULL';

  const mostFrequent = db
    .prepare(
      `SELECT t.terror_name AS terrorName, COUNT(*) AS count
       FROM terrors t
       ${nameWhereClause}
       GROUP BY t.terror_name
       ORDER BY count DESC, MAX(t.start_time) DESC
       LIMIT 1`
    )
    .get(params) as { terrorName: string; count: number } | undefined;

  return {
    ...aggregates,
    mostProfitableTerror: mostProfitable ?? null,
    leastProfitableTerror: leastProfitable ?? null,
    mostFrequentTerror: mostFrequent ?? null,
  };
}

export interface TerrorRareKillRow {
  id: number;
  terrorId: number;
  terrorName: string | null;
  startTime: string;
  enemy: string;
  count: number;
}

export function computeTerrorRareKills(filter: TerrorFilterQuery): TerrorRareKillRow[] {
  const { whereClause, params } = buildTerrorFilter(filter);
  const rareClause = whereClause ? `${whereClause} AND ed.rare = 1` : 'WHERE ed.rare = 1';

  return db
    .prepare(
      `SELECT ed.id AS id, ed.terror_id AS terrorId, t.terror_name AS terrorName, t.start_time AS startTime,
              ed.enemy AS enemy, ed.count AS count
       FROM terror_enemies_defeated ed
       JOIN terrors t ON t.id = ed.terror_id
       ${rareClause}
       ORDER BY t.start_time DESC, ed.id ASC`
    )
    .all(params) as unknown as TerrorRareKillRow[];
}

const BUCKET_EXPRESSIONS: Record<string, string> = {
  day: "date(t.start_time)",
  week: "date(t.start_time, 'weekday 0', '-6 days')",
  month: "strftime('%Y-%m-01', t.start_time)",
};

export function computeTerrorTrends(filter: TerrorFilterQuery, bucket: string) {
  const { whereClause, params } = buildTerrorFilter(filter);

  if (bucket === 'terror') {
    return db
      .prepare(
        `SELECT t.id AS huntId, t.terror_name AS huntName, t.start_time AS bucketStart,
                1 AS huntCount, t.profit AS totalProfit, t.profit_per_hour AS avgProfitPerHour,
                t.kills_per_hour AS avgKillsPerHour, t.rare_kills_per_hour AS avgRareKillsPerHour,
                t.experience_per_hour AS avgExperiencePerHour, t.supplies_per_hour AS avgSuppliesPerHour,
                (SELECT GROUP_CONCAT(td.item || '::' || td.unit_price, '||')
                   FROM (SELECT item, unit_price FROM terror_drops WHERE terror_id = t.id AND (ignored IS NULL OR ignored = 0)
                         ORDER BY unit_price DESC LIMIT 5) td) AS topDropsRaw
         FROM terrors t
         ${whereClause}
         ORDER BY t.start_time ASC`
      )
      .all(params)
      .map((row: any) => ({
        ...row,
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
         COALESCE(SUM(t.profit), 0) AS totalProfit,
         AVG(t.profit_per_hour) AS avgProfitPerHour,
         AVG(t.kills_per_hour) AS avgKillsPerHour,
         AVG(t.rare_kills_per_hour) AS avgRareKillsPerHour,
         AVG(t.experience_per_hour) AS avgExperiencePerHour,
         AVG(t.supplies_per_hour) AS avgSuppliesPerHour
       FROM terrors t
       ${whereClause}
       GROUP BY bucketStart
       ORDER BY bucketStart ASC`
    )
    .all(params);
}
