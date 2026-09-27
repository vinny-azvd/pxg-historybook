import { Router } from 'express';
import { db } from '../db/connection.js';
import { validateMdExport } from '../services/mdValidation.js';
import { DuplicateMdError, ingestMd } from '../services/mdIngestion.js';
import { buildMdFilter } from '../services/mdFilters.js';

export const mdsRouter = Router();

const SORTABLE_COLUMNS: Record<string, string> = {
  start_time: 't.start_time',
  md_name: 't.md_name',
  profit: 't.profit',
  profit_per_hour: 't.profit_per_hour',
  kills: 't.kills',
  kills_per_hour: 't.kills_per_hour',
  rare_kills_per_hour: 't.rare_kills_per_hour',
  duration_seconds: 't.duration_seconds',
};

mdsRouter.post('/', (req, res) => {
  // Accepts either the raw md export as the body, or a
  // { md, mdName } wrapper so the upload UI can let the user confirm
  // (and override) the auto-detected name before it's saved.
  const body = req.body as unknown;
  const isWrapped =
    body !== null && typeof body === 'object' && 'md' in (body as Record<string, unknown>) &&
    typeof (body as Record<string, unknown>).md === 'object';
  const mdPayload = isWrapped ? (body as { md: unknown }).md : body;
  const mdNameOverrideRaw = isWrapped ? (body as { mdName?: unknown }).mdName : undefined;
  const mdNameOverride = typeof mdNameOverrideRaw === 'string' ? mdNameOverrideRaw : undefined;

  const parsed = validateMdExport(mdPayload);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_md_export', issues: parsed.error.issues });
  }

  const rawJson = JSON.stringify(mdPayload);
  try {
    const result = ingestMd(rawJson, parsed.data, mdNameOverride);
    const summary = db.prepare('SELECT * FROM mds WHERE id = ?').get(result.id);
    res.status(201).json({ ...result, summary });
  } catch (err) {
    if (err instanceof DuplicateMdError) {
      return res.status(409).json({ error: 'duplicate_md', existingMdId: err.existingMdId });
    }
    console.error(err);
    res.status(500).json({ error: 'ingestion_failed' });
  }
});

mdsRouter.get('/', (req, res) => {
  const { player, from, to, sessionType, sort = 'start_time', order = 'desc', page = '1', pageSize = '25' } = req.query as Record<string, string>;

  const { whereClause, params } = buildMdFilter({ player, from, to, sessionType });
  const sortColumn = SORTABLE_COLUMNS[sort] ?? SORTABLE_COLUMNS.start_time;
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 25));
  const offset = (pageNum - 1) * pageSizeNum;

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM mds t ${whereClause}`)
    .get(params) as { count: number };

  const rows = db
    .prepare(
      `SELECT t.id, t.md_name, t.session_type, t.status, t.start_time, t.duration_seconds, t.kills, t.kills_per_hour,
              t.rare_kills, t.rare_kills_per_hour, t.experience_per_hour, t.supplies_cost, t.supplies_per_hour,
              t.profit, t.profit_per_hour,
              t.damage_dealt_per_second, t.damage_taken_per_second,
              (SELECT GROUP_CONCAT(p.name, '||') FROM md_players tp JOIN players p ON p.id = tp.player_id WHERE tp.md_id = t.id) AS players,
              (SELECT GROUP_CONCAT(td.item || '::' || td.unit_price, '||')
                 FROM (SELECT item, unit_price FROM md_drops WHERE md_id = t.id AND (ignored IS NULL OR ignored = 0)
                       ORDER BY unit_price DESC LIMIT 5) td) AS top_drops
       FROM mds t
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

mdsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const md = db.prepare('SELECT * FROM mds WHERE id = ?').get(id);
  if (!md) return res.status(404).json({ error: 'not_found' });

  const players = db
    .prepare(
      `SELECT p.id, p.name FROM md_players tp JOIN players p ON p.id = tp.player_id WHERE tp.md_id = ? ORDER BY p.name`
    )
    .all(id);

  const damage = db
    .prepare(
      `SELECT d.*, p.name AS player_name FROM md_damage d LEFT JOIN players p ON p.id = d.player_id WHERE d.md_id = ?`
    )
    .all(id);

  const supplies = db
    .prepare(
      `SELECT s.*, p.name AS player_name, ii.icon_url
       FROM md_supplies s
       LEFT JOIN players p ON p.id = s.player_id
       LEFT JOIN item_icons ii ON ii.name_normalized = s.item_normalized
       WHERE s.md_id = ?
       ORDER BY s.total_price DESC`
    )
    .all(id);

  const drops = db
    .prepare(
      `SELECT dr.*, p.name AS player_name, ii.icon_url
       FROM md_drops dr
       LEFT JOIN players p ON p.id = dr.player_id
       LEFT JOIN item_icons ii ON ii.name_normalized = dr.item_normalized
       WHERE dr.md_id = ?
       ORDER BY dr.total_price DESC`
    )
    .all(id);

  const experience = db
    .prepare(
      `SELECT e.*, p.name AS player_name FROM md_experience e LEFT JOIN players p ON p.id = e.player_id WHERE e.md_id = ?`
    )
    .all(id);

  const enemiesDefeated = db
    .prepare(
      `SELECT ed.*, p.name AS player_name FROM md_enemies_defeated ed LEFT JOIN players p ON p.id = ed.player_id WHERE ed.md_id = ?`
    )
    .all(id);

  res.json({ md, players, damage, supplies, drops, experience, enemiesDefeated });
});

mdsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const mdName = typeof req.body?.mdName === 'string' ? req.body.mdName.trim() : '';
  if (!mdName) {
    return res.status(400).json({ error: 'md_name_required' });
  }
  const result = db.prepare('UPDATE mds SET md_name = ? WHERE id = ?').run(mdName, id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  const md = db.prepare('SELECT * FROM mds WHERE id = ?').get(id);
  res.json({ md });
});

mdsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM mds WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
