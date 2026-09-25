import { Router } from 'express';
import { db } from '../db/connection.js';
import { validateTerrorExport } from '../services/terrorValidation.js';
import { DuplicateTerrorError, ingestTerror } from '../services/terrorIngestion.js';
import { buildTerrorFilter } from '../services/terrorFilters.js';

export const terrorsRouter = Router();

const SORTABLE_COLUMNS: Record<string, string> = {
  start_time: 't.start_time',
  terror_name: 't.terror_name',
  profit: 't.profit',
  profit_per_hour: 't.profit_per_hour',
  kills: 't.kills',
  kills_per_hour: 't.kills_per_hour',
  rare_kills_per_hour: 't.rare_kills_per_hour',
  duration_seconds: 't.duration_seconds',
};

terrorsRouter.post('/', (req, res) => {
  // Accepts either the raw terror export as the body, or a
  // { terror, terrorName } wrapper so the upload UI can let the user confirm
  // (and override) the auto-detected name before it's saved.
  const body = req.body as unknown;
  const isWrapped =
    body !== null && typeof body === 'object' && 'terror' in (body as Record<string, unknown>) &&
    typeof (body as Record<string, unknown>).terror === 'object';
  const terrorPayload = isWrapped ? (body as { terror: unknown }).terror : body;
  const terrorNameOverrideRaw = isWrapped ? (body as { terrorName?: unknown }).terrorName : undefined;
  const terrorNameOverride = typeof terrorNameOverrideRaw === 'string' ? terrorNameOverrideRaw : undefined;

  const parsed = validateTerrorExport(terrorPayload);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_terror_export', issues: parsed.error.issues });
  }

  const rawJson = JSON.stringify(terrorPayload);
  try {
    const result = ingestTerror(rawJson, parsed.data, terrorNameOverride);
    const summary = db.prepare('SELECT * FROM terrors WHERE id = ?').get(result.id);
    res.status(201).json({ ...result, summary });
  } catch (err) {
    if (err instanceof DuplicateTerrorError) {
      return res.status(409).json({ error: 'duplicate_terror', existingTerrorId: err.existingTerrorId });
    }
    console.error(err);
    res.status(500).json({ error: 'ingestion_failed' });
  }
});

terrorsRouter.get('/', (req, res) => {
  const { player, from, to, sessionType, sort = 'start_time', order = 'desc', page = '1', pageSize = '25' } = req.query as Record<string, string>;

  const { whereClause, params } = buildTerrorFilter({ player, from, to, sessionType });
  const sortColumn = SORTABLE_COLUMNS[sort] ?? SORTABLE_COLUMNS.start_time;
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 25));
  const offset = (pageNum - 1) * pageSizeNum;

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM terrors t ${whereClause}`)
    .get(params) as { count: number };

  const rows = db
    .prepare(
      `SELECT t.id, t.terror_name, t.session_type, t.status, t.start_time, t.duration_seconds, t.kills, t.kills_per_hour,
              t.rare_kills, t.rare_kills_per_hour, t.experience_per_hour, t.supplies_cost, t.supplies_per_hour,
              t.profit, t.profit_per_hour,
              t.damage_dealt_per_second, t.damage_taken_per_second,
              (SELECT GROUP_CONCAT(p.name, '||') FROM terror_players tp JOIN players p ON p.id = tp.player_id WHERE tp.terror_id = t.id) AS players,
              (SELECT GROUP_CONCAT(td.item || '::' || td.unit_price, '||')
                 FROM (SELECT item, unit_price FROM terror_drops WHERE terror_id = t.id AND (ignored IS NULL OR ignored = 0)
                       ORDER BY unit_price DESC LIMIT 5) td) AS top_drops
       FROM terrors t
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSizeNum, offset });

  const items = rows.map((row: any) => ({
    ...row,
    players: row.players ? row.players.split('||') : [],
    top_drops: row.top_drops
      ? row.top_drops.split('||').map((entry: string) => {
          const [item, unitPrice] = entry.split('::');
          return { item, unitPrice: Number(unitPrice) };
        })
      : [],
  }));

  res.json({ items, total: total.count, page: pageNum, pageSize: pageSizeNum });
});

terrorsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const terror = db.prepare('SELECT * FROM terrors WHERE id = ?').get(id);
  if (!terror) return res.status(404).json({ error: 'not_found' });

  const players = db
    .prepare(
      `SELECT p.id, p.name FROM terror_players tp JOIN players p ON p.id = tp.player_id WHERE tp.terror_id = ? ORDER BY p.name`
    )
    .all(id);

  const damage = db
    .prepare(
      `SELECT d.*, p.name AS player_name FROM terror_damage d LEFT JOIN players p ON p.id = d.player_id WHERE d.terror_id = ?`
    )
    .all(id);

  const supplies = db
    .prepare(
      `SELECT s.*, p.name AS player_name, ii.icon_url
       FROM terror_supplies s
       LEFT JOIN players p ON p.id = s.player_id
       LEFT JOIN item_icons ii ON ii.name_normalized = s.item_normalized
       WHERE s.terror_id = ?
       ORDER BY s.total_price DESC`
    )
    .all(id);

  const drops = db
    .prepare(
      `SELECT dr.*, p.name AS player_name, ii.icon_url
       FROM terror_drops dr
       LEFT JOIN players p ON p.id = dr.player_id
       LEFT JOIN item_icons ii ON ii.name_normalized = dr.item_normalized
       WHERE dr.terror_id = ?
       ORDER BY dr.total_price DESC`
    )
    .all(id);

  const experience = db
    .prepare(
      `SELECT e.*, p.name AS player_name FROM terror_experience e LEFT JOIN players p ON p.id = e.player_id WHERE e.terror_id = ?`
    )
    .all(id);

  const enemiesDefeated = db
    .prepare(
      `SELECT ed.*, p.name AS player_name FROM terror_enemies_defeated ed LEFT JOIN players p ON p.id = ed.player_id WHERE ed.terror_id = ?`
    )
    .all(id);

  res.json({ terror, players, damage, supplies, drops, experience, enemiesDefeated });
});

terrorsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const terrorName = typeof req.body?.terrorName === 'string' ? req.body.terrorName.trim() : '';
  if (!terrorName) {
    return res.status(400).json({ error: 'terror_name_required' });
  }
  const result = db.prepare('UPDATE terrors SET terror_name = ? WHERE id = ?').run(terrorName, id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  const terror = db.prepare('SELECT * FROM terrors WHERE id = ?').get(id);
  res.json({ terror });
});

terrorsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM terrors WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
