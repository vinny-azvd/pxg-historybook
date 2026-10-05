import { db } from '../db/connection.js';

export interface TopDrop {
  item: string;
  unitPrice: number;
}

// A week/month can hold several lucky drops from different entries, so it
// keeps a few more than an entry's top 5 before the rare-price threshold
// (a client-side preference) filters them down.
const BUCKET_TOP_DROPS = 10;

interface BucketDropsQuery {
  table: 'hunts' | 'terrors' | 'mds';
  alias: 'h' | 't';
  dropsTable: 'hunt_drops' | 'terror_drops' | 'md_drops';
  playersTable: 'hunt_players' | 'terror_players' | 'md_players';
  foreignKey: 'hunt_id' | 'terror_id' | 'md_id';
  bucketExpr: string;
  whereClause: string;
  params: Record<string, string | number>;
  byPlayer: boolean;
}

/** Highest-unit-price drops per day/week/month bucket (and per player, when
 * `byPlayer`), keyed `${playerId}::${bucketStart}` - playerId is empty when
 * not split by player. A party entry's drops count toward every player in
 * it, same as its profit does in the by-player trends. */
export function bucketTopDrops(q: BucketDropsQuery): Map<string, TopDrop[]> {
  const notIgnored = '(d.ignored IS NULL OR d.ignored = 0)';
  const where = q.whereClause ? `${q.whereClause} AND ${notIgnored}` : `WHERE ${notIgnored}`;
  const rows = db
    .prepare(
      `SELECT
         ${q.byPlayer ? 'pp.player_id' : "''"} AS playerId,
         ${q.bucketExpr} AS bucketStart,
         d.item AS item,
         MAX(d.unit_price) AS unitPrice
       FROM ${q.table} ${q.alias}
       JOIN ${q.dropsTable} d ON d.${q.foreignKey} = ${q.alias}.id
       ${q.byPlayer ? `JOIN ${q.playersTable} pp ON pp.${q.foreignKey} = ${q.alias}.id` : ''}
       ${where}
       GROUP BY playerId, bucketStart, d.item`
    )
    .all(q.params) as unknown as { playerId: number | string; bucketStart: string; item: string; unitPrice: number }[];

  const byKey = new Map<string, TopDrop[]>();
  for (const row of rows) {
    const key = `${row.playerId}::${row.bucketStart}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push({ item: row.item, unitPrice: row.unitPrice });
  }
  for (const [key, drops] of byKey) {
    byKey.set(key, drops.sort((a, b) => b.unitPrice - a.unitPrice).slice(0, BUCKET_TOP_DROPS));
  }
  return byKey;
}

/** Parses the `item::unitPrice||...` GROUP_CONCAT used by entry-level trend rows. */
export function parseTopDropsRaw(raw: string | null | undefined): TopDrop[] {
  if (!raw) return [];
  return raw.split('||').map((entry) => {
    const [item, unitPrice] = entry.split('::');
    return { item, unitPrice: Number(unitPrice) };
  });
}
