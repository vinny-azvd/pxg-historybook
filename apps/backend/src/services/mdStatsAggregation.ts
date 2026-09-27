import { db } from '../db/connection.js';
import { buildMdFilter, type MdFilterQuery } from './mdFilters.js';

export interface MdOverviewStats {
  mdCount: number;
  totalProfit: number;
  avgProfit: number | null;
  maxProfit: number | null;
  avgExperience: number | null;
  totalExperience: number;
  mostProfitableMd: { id: number; mdName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  leastProfitableMd: { id: number; mdName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  mostFrequentMd: { mdName: string; count: number } | null;
}

// Framed the same way as the Terror overview - totals and per-run averages
// instead of Hunts' per-hour rates. Unlike Terror, MD has no fixed entry-cost
// supply item to track, so there's no equivalent to Terror's "tokens per try"
// average here.
export function computeMdOverview(filter: MdFilterQuery): MdOverviewStats {
  const { whereClause, params } = buildMdFilter(filter);

  const aggregates = db
    .prepare(
      `SELECT
         COUNT(*) AS mdCount,
         COALESCE(SUM(t.profit), 0) AS totalProfit,
         AVG(t.profit) AS avgProfit,
         MAX(t.profit) AS maxProfit,
         AVG(t.experience) AS avgExperience,
         COALESCE(SUM(t.experience), 0) AS totalExperience
       FROM mds t
       ${whereClause}`
    )
    .get(params) as any;

  const playersSubquery = `(SELECT GROUP_CONCAT(p.name, '||') FROM md_players tp JOIN players p ON p.id = tp.player_id WHERE tp.md_id = t.id)`;

  const mostProfitable = db
    .prepare(
      `SELECT t.id, t.md_name AS mdName, t.profit, t.profit_per_hour AS profitPerHour, t.start_time AS startTime,
              ${playersSubquery} AS playersRaw
       FROM mds t
       ${whereClause}
       ORDER BY t.profit DESC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; mdName: string | null; profit: number; profitPerHour: number; startTime: string; playersRaw: string | null }
    | undefined;

  const leastProfitable = db
    .prepare(
      `SELECT t.id, t.md_name AS mdName, t.profit, t.profit_per_hour AS profitPerHour, t.start_time AS startTime,
              ${playersSubquery} AS playersRaw
       FROM mds t
       ${whereClause}
       ORDER BY t.profit ASC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; mdName: string | null; profit: number; profitPerHour: number; startTime: string; playersRaw: string | null }
    | undefined;

  const nameWhereClause = whereClause
    ? `${whereClause} AND t.md_name IS NOT NULL`
    : 'WHERE t.md_name IS NOT NULL';

  const mostFrequent = db
    .prepare(
      `SELECT t.md_name AS mdName, COUNT(*) AS count
       FROM mds t
       ${nameWhereClause}
       GROUP BY t.md_name
       ORDER BY count DESC, MAX(t.start_time) DESC
       LIMIT 1`
    )
    .get(params) as { mdName: string; count: number } | undefined;

  return {
    ...aggregates,
    mostProfitableMd: mostProfitable
      ? {
          id: mostProfitable.id,
          mdName: mostProfitable.mdName,
          profit: mostProfitable.profit,
          profitPerHour: mostProfitable.profitPerHour,
          startTime: mostProfitable.startTime,
          players: mostProfitable.playersRaw ? mostProfitable.playersRaw.split('||') : [],
        }
      : null,
    leastProfitableMd: leastProfitable
      ? {
          id: leastProfitable.id,
          mdName: leastProfitable.mdName,
          profit: leastProfitable.profit,
          profitPerHour: leastProfitable.profitPerHour,
          startTime: leastProfitable.startTime,
          players: leastProfitable.playersRaw ? leastProfitable.playersRaw.split('||') : [],
        }
      : null,
    mostFrequentMd: mostFrequent ?? null,
  };
}

export interface MdWeeklySummary {
  weekStart: string;
  mdCount: number;
  totalProfit: number;
  avgProfit: number | null;
}

// Grouped by week for the same reason as Terror's history list: one card
// per week, with a summary + expandable grid when a week has more than one
// import.
export function computeMdWeeklyGroups(
  filter: MdFilterQuery,
  page: number,
  pageSize: number
): { items: MdWeeklySummary[]; total: number } {
  const { whereClause, params } = buildMdFilter(filter);
  const weekExpr = "date(t.start_time, 'weekday 0', '-6 days')";

  const totalRow = db
    .prepare(`SELECT COUNT(DISTINCT ${weekExpr}) AS count FROM mds t ${whereClause}`)
    .get(params) as { count: number };

  const items = db
    .prepare(
      `SELECT
         ${weekExpr} AS weekStart,
         COUNT(*) AS mdCount,
         COALESCE(SUM(t.profit), 0) AS totalProfit,
         AVG(t.profit) AS avgProfit
       FROM mds t
       ${whereClause}
       GROUP BY weekStart
       ORDER BY weekStart DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as unknown as MdWeeklySummary[];

  return { items, total: totalRow.count };
}

// Same shape as computeMdTrends' rows, but broken out one series per
// character instead of averaged across all of them - lets the dashboard
// color-code who ran what, same as the Hunts dashboard's per-player chart.
export function computeMdTrendsByPlayer(filter: MdFilterQuery, bucket: string) {
  const { whereClause, params } = buildMdFilter(filter);

  if (bucket === 'md') {
    return db
      .prepare(
        `SELECT
           p.id AS playerId,
           p.name AS playerName,
           t.id AS huntId,
           t.md_name AS huntName,
           t.start_time AS bucketStart,
           1 AS huntCount,
           t.profit AS totalProfit,
           t.profit AS avgProfit,
           t.experience AS avgExperience,
           t.supplies_cost AS avgSupplies
         FROM mds t
         JOIN md_players tp ON tp.md_id = t.id
         JOIN players p ON p.id = tp.player_id
         ${whereClause}
         ORDER BY p.id, t.start_time ASC`
      )
      .all(params);
  }

  const bucketExpr = BUCKET_EXPRESSIONS[bucket] ?? BUCKET_EXPRESSIONS.week;

  return db
    .prepare(
      `SELECT
         p.id AS playerId,
         p.name AS playerName,
         ${bucketExpr} AS bucketStart,
         COUNT(*) AS huntCount,
         COALESCE(SUM(t.profit), 0) AS totalProfit,
         AVG(t.profit) AS avgProfit,
         AVG(t.experience) AS avgExperience,
         AVG(t.supplies_cost) AS avgSupplies
       FROM mds t
       JOIN md_players tp ON tp.md_id = t.id
       JOIN players p ON p.id = tp.player_id
       ${whereClause}
       GROUP BY p.id, bucketStart
       ORDER BY p.id, bucketStart ASC`
    )
    .all(params);
}

const BUCKET_EXPRESSIONS: Record<string, string> = {
  day: "date(t.start_time)",
  week: "date(t.start_time, 'weekday 0', '-6 days')",
  month: "strftime('%Y-%m-01', t.start_time)",
};

export function computeMdTrends(filter: MdFilterQuery, bucket: string) {
  const { whereClause, params } = buildMdFilter(filter);

  if (bucket === 'md') {
    return db
      .prepare(
        `SELECT t.id AS huntId, t.md_name AS huntName, t.start_time AS bucketStart,
                1 AS huntCount, t.profit AS totalProfit, t.profit AS avgProfit,
                t.kills AS avgKills, t.rare_kills AS avgRareKills,
                t.experience AS avgExperience, t.supplies_cost AS avgSupplies,
                (SELECT GROUP_CONCAT(td.item || '::' || td.unit_price, '||')
                   FROM (SELECT item, unit_price FROM md_drops WHERE md_id = t.id AND (ignored IS NULL OR ignored = 0)
                         ORDER BY unit_price DESC LIMIT 5) td) AS topDropsRaw
         FROM mds t
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
         AVG(t.profit) AS avgProfit,
         AVG(t.kills) AS avgKills,
         AVG(t.rare_kills) AS avgRareKills,
         AVG(t.experience) AS avgExperience,
         AVG(t.supplies_cost) AS avgSupplies
       FROM mds t
       ${whereClause}
       GROUP BY bucketStart
       ORDER BY bucketStart ASC`
    )
    .all(params);
}
