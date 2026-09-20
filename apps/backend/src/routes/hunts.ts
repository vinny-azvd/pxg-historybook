import { Router } from 'express';
import { db } from '../db/connection.js';
import { validateHuntExport } from '../services/huntValidation.js';
import { DuplicateHuntError, ingestHunt } from '../services/huntIngestion.js';
import { buildHuntFilter } from '../services/huntFilters.js';

export const huntsRouter = Router();

const SORTABLE_COLUMNS: Record<string, string> = {
  start_time: 'h.start_time',
  hunt_name: 'h.hunt_name',
  profit: 'h.profit',
  profit_per_hour: 'h.profit_per_hour',
  kills: 'h.kills',
  kills_per_hour: 'h.kills_per_hour',
  rare_kills_per_hour: 'h.rare_kills_per_hour',
  duration_seconds: 'h.duration_seconds',
};

huntsRouter.post('/', (req, res) => {
  // Accepts either the raw hunt export as the body (simple/API-friendly), or
  // a { hunt, huntName } wrapper so the upload UI can let the user confirm
  // (and override) the auto-detected hunt name before it's saved.
  const body = req.body as unknown;
  const isWrapped =
    body !== null && typeof body === 'object' && 'hunt' in (body as Record<string, unknown>) &&
    typeof (body as Record<string, unknown>).hunt === 'object';
  const huntPayload = isWrapped ? (body as { hunt: unknown }).hunt : body;
  const huntNameOverrideRaw = isWrapped ? (body as { huntName?: unknown }).huntName : undefined;
  const huntNameOverride = typeof huntNameOverrideRaw === 'string' ? huntNameOverrideRaw : undefined;

  const parsed = validateHuntExport(huntPayload);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_hunt_export', issues: parsed.error.issues });
  }

  const rawJson = JSON.stringify(huntPayload);
  try {
    const result = ingestHunt(rawJson, parsed.data, huntNameOverride);
    const summary = db.prepare('SELECT * FROM hunts WHERE id = ?').get(result.id);
    res.status(201).json({ ...result, summary });
  } catch (err) {
    if (err instanceof DuplicateHuntError) {
      return res.status(409).json({ error: 'duplicate_hunt', existingHuntId: err.existingHuntId });
    }
    console.error(err);
    res.status(500).json({ error: 'ingestion_failed' });
  }
});

huntsRouter.get('/', (req, res) => {
  const { player, from, to, sessionType, sort = 'start_time', order = 'desc', page = '1', pageSize = '25' } = req.query as Record<string, string>;

  const { whereClause, params } = buildHuntFilter({ player, from, to, sessionType });
  const sortColumn = SORTABLE_COLUMNS[sort] ?? SORTABLE_COLUMNS.start_time;
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 25));
  const offset = (pageNum - 1) * pageSizeNum;

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM hunts h ${whereClause}`)
    .get(params) as { count: number };

  const rows = db
    .prepare(
      `SELECT h.id, h.hunt_name, h.session_type, h.status, h.start_time, h.duration_seconds, h.kills, h.kills_per_hour,
              h.rare_kills, h.rare_kills_per_hour, h.experience_per_hour, h.supplies_cost, h.supplies_per_hour,
              h.profit, h.profit_per_hour,
              (SELECT GROUP_CONCAT(p.name, '||') FROM hunt_players hp JOIN players p ON p.id = hp.player_id WHERE hp.hunt_id = h.id) AS players
       FROM hunts h
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSizeNum, offset });

  const items = rows.map((row: any) => ({
    ...row,
    players: row.players ? row.players.split('||') : [],
  }));

  res.json({ items, total: total.count, page: pageNum, pageSize: pageSizeNum });
});

huntsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const hunt = db.prepare('SELECT * FROM hunts WHERE id = ?').get(id);
  if (!hunt) return res.status(404).json({ error: 'not_found' });

  const players = db
    .prepare(
      `SELECT p.id, p.name FROM hunt_players hp JOIN players p ON p.id = hp.player_id WHERE hp.hunt_id = ? ORDER BY p.name`
    )
    .all(id);

  const damage = db
    .prepare(
      `SELECT d.*, p.name AS player_name FROM hunt_damage d LEFT JOIN players p ON p.id = d.player_id WHERE d.hunt_id = ?`
    )
    .all(id);

  const supplies = db
    .prepare(
      `SELECT s.*, p.name AS player_name, ii.icon_url
       FROM hunt_supplies s
       LEFT JOIN players p ON p.id = s.player_id
       LEFT JOIN item_icons ii ON ii.name_normalized = s.item_normalized
       WHERE s.hunt_id = ?
       ORDER BY s.total_price DESC`
    )
    .all(id);

  const drops = db
    .prepare(
      `SELECT dr.*, p.name AS player_name, ii.icon_url
       FROM hunt_drops dr
       LEFT JOIN players p ON p.id = dr.player_id
       LEFT JOIN item_icons ii ON ii.name_normalized = dr.item_normalized
       WHERE dr.hunt_id = ?
       ORDER BY dr.total_price DESC`
    )
    .all(id);

  const experience = db
    .prepare(
      `SELECT e.*, p.name AS player_name FROM hunt_experience e LEFT JOIN players p ON p.id = e.player_id WHERE e.hunt_id = ?`
    )
    .all(id);

  const enemiesDefeated = db
    .prepare(
      `SELECT ed.*, p.name AS player_name FROM hunt_enemies_defeated ed LEFT JOIN players p ON p.id = ed.player_id WHERE ed.hunt_id = ?`
    )
    .all(id);

  res.json({ hunt, players, damage, supplies, drops, experience, enemiesDefeated });
});

huntsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const huntName = typeof req.body?.huntName === 'string' ? req.body.huntName.trim() : '';
  if (!huntName) {
    return res.status(400).json({ error: 'hunt_name_required' });
  }
  const result = db.prepare('UPDATE hunts SET hunt_name = ? WHERE id = ?').run(huntName, id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  const hunt = db.prepare('SELECT * FROM hunts WHERE id = ?').get(id);
  res.json({ hunt });
});

huntsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM hunts WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
