import { db } from '../db/connection.js';
import { buildTerrorFilter, type TerrorFilterQuery } from './terrorFilters.js';

export interface TerrorOverviewStats {
  terrorCount: number;
  totalProfit: number;
  avgProfit: number | null;
  maxProfit: number | null;
  avgExperience: number | null;
  totalExperience: number;
  // Average count of "Nightmare token" consumed per terror - the item spent
  // as the entry cost per boss try, not a gold amount (it has no market
  // price, so a gold-based supplies average is meaningless here).
  avgNightmareTokens: number | null;
  mostProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  leastProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  mostFrequentTerror: { terrorName: string; count: number } | null;
}

// Terror is a weekly rotation you clear once, not an ongoing hunt you
// optimize gold/hour on - so its overview is framed around totals and
// per-rotation averages rather than the hourly rates Hunts uses. Kills/rare
// kills aren't tracked here at all: the game's analyzer doesn't count boss
// encounters toward "Kills"/"Rare kills" the way it does in a Hunt, so those
// fields are always 0 for a Terror import and were dropped as dead data.
export function computeTerrorOverview(filter: TerrorFilterQuery): TerrorOverviewStats {
  const { whereClause, params } = buildTerrorFilter(filter);

  const aggregates = db
    .prepare(
      `SELECT
         COUNT(*) AS terrorCount,
         COALESCE(SUM(t.profit), 0) AS totalProfit,
         AVG(t.profit) AS avgProfit,
         MAX(t.profit) AS maxProfit,
         AVG(t.experience) AS avgExperience,
         COALESCE(SUM(t.experience), 0) AS totalExperience,
         AVG((
           SELECT COALESCE(SUM(s.count), 0) FROM terror_supplies s
           WHERE s.terror_id = t.id AND s.item_normalized = 'nightmare token'
         )) AS avgNightmareTokens
       FROM terrors t
       ${whereClause}`
    )
    .get(params) as any;

  const playersSubquery = `(SELECT GROUP_CONCAT(p.name, '||') FROM terror_players tp JOIN players p ON p.id = tp.player_id WHERE tp.terror_id = t.id)`;

  const mostProfitable = db
    .prepare(
      `SELECT t.id, t.terror_name AS terrorName, t.profit, t.profit_per_hour AS profitPerHour, t.start_time AS startTime,
              ${playersSubquery} AS playersRaw
       FROM terrors t
       ${whereClause}
       ORDER BY t.profit DESC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string; playersRaw: string | null }
    | undefined;

  const leastProfitable = db
    .prepare(
      `SELECT t.id, t.terror_name AS terrorName, t.profit, t.profit_per_hour AS profitPerHour, t.start_time AS startTime,
              ${playersSubquery} AS playersRaw
       FROM terrors t
       ${whereClause}
       ORDER BY t.profit ASC
       LIMIT 1`
    )
    .get(params) as
    | { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string; playersRaw: string | null }
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
    mostProfitableTerror: mostProfitable
      ? {
          id: mostProfitable.id,
          terrorName: mostProfitable.terrorName,
          profit: mostProfitable.profit,
          profitPerHour: mostProfitable.profitPerHour,
          startTime: mostProfitable.startTime,
          players: mostProfitable.playersRaw ? mostProfitable.playersRaw.split('||') : [],
        }
      : null,
    leastProfitableTerror: leastProfitable
      ? {
          id: leastProfitable.id,
          terrorName: leastProfitable.terrorName,
          profit: leastProfitable.profit,
          profitPerHour: leastProfitable.profitPerHour,
          startTime: leastProfitable.startTime,
          players: leastProfitable.playersRaw ? leastProfitable.playersRaw.split('||') : [],
        }
      : null,
    mostFrequentTerror: mostFrequent ?? null,
  };
}

export interface TerrorWeeklySummary {
  weekStart: string;
  terrorCount: number;
  totalProfit: number;
  avgProfit: number | null;
}

// Terror is a weekly boss rotation, so the natural browsing unit for the
// history list is "one card per week" rather than one per import - most
// weeks have exactly one, but nothing stops someone from splitting a
// rotation across multiple imports (or redoing part of it).
export function computeTerrorWeeklyGroups(
  filter: TerrorFilterQuery,
  page: number,
  pageSize: number
): { items: TerrorWeeklySummary[]; total: number } {
  const { whereClause, params } = buildTerrorFilter(filter);
  const weekExpr = "date(t.start_time, 'weekday 0', '-6 days')";

  const totalRow = db
    .prepare(`SELECT COUNT(DISTINCT ${weekExpr}) AS count FROM terrors t ${whereClause}`)
    .get(params) as { count: number };

  const items = db
    .prepare(
      `SELECT
         ${weekExpr} AS weekStart,
         COUNT(*) AS terrorCount,
         COALESCE(SUM(t.profit), 0) AS totalProfit,
         AVG(t.profit) AS avgProfit
       FROM terrors t
       ${whereClause}
       GROUP BY weekStart
       ORDER BY weekStart DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as unknown as TerrorWeeklySummary[];

  return { items, total: totalRow.count };
}

// Same shape as computeTerrorTrends' rows, but broken out one series per
// character instead of averaged across all of them - lets the dashboard
// color-code who ran what, same as the Hunts dashboard's per-player chart.
export function computeTerrorTrendsByPlayer(filter: TerrorFilterQuery, bucket: string) {
  const { whereClause, params } = buildTerrorFilter(filter);

  if (bucket === 'terror') {
    return db
      .prepare(
        `SELECT
           p.id AS playerId,
           p.name AS playerName,
           t.id AS huntId,
           t.terror_name AS huntName,
           t.start_time AS bucketStart,
           1 AS huntCount,
           t.profit AS totalProfit,
           t.profit AS avgProfit,
           t.experience AS avgExperience,
           t.supplies_cost AS avgSupplies
         FROM terrors t
         JOIN terror_players tp ON tp.terror_id = t.id
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
       FROM terrors t
       JOIN terror_players tp ON tp.terror_id = t.id
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

export function computeTerrorTrends(filter: TerrorFilterQuery, bucket: string) {
  const { whereClause, params } = buildTerrorFilter(filter);

  if (bucket === 'terror') {
    return db
      .prepare(
        `SELECT t.id AS huntId, t.terror_name AS huntName, t.start_time AS bucketStart,
                1 AS huntCount, t.profit AS totalProfit, t.profit AS avgProfit,
                t.kills AS avgKills, t.rare_kills AS avgRareKills,
                t.experience AS avgExperience, t.supplies_cost AS avgSupplies,
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
         AVG(t.profit) AS avgProfit,
         AVG(t.kills) AS avgKills,
         AVG(t.rare_kills) AS avgRareKills,
         AVG(t.experience) AS avgExperience,
         AVG(t.supplies_cost) AS avgSupplies
       FROM terrors t
       ${whereClause}
       GROUP BY bucketStart
       ORDER BY bucketStart ASC`
    )
    .all(params);
}
