import crypto from 'node:crypto';
import { db, withTransaction } from '../db/connection.js';
import { normalizeItemName } from './itemIconMatcher.js';
import { deriveTerrorName } from './terrorNaming.js';
import type { TerrorExport } from './terrorValidation.js';

export class DuplicateTerrorError extends Error {
  constructor(public existingTerrorId: number) {
    super('Terror already imported');
  }
}

function hashPayload(rawJson: string): string {
  return crypto.createHash('sha256').update(rawJson).digest('hex');
}

function upsertPlayer(name: string): number {
  const trimmed = name.trim();
  const existing = db.prepare('SELECT id FROM players WHERE name = ?').get(trimmed) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare('INSERT INTO players (name) VALUES (?)').run(trimmed);
  return Number(result.lastInsertRowid);
}

export function ingestTerror(
  rawJson: string,
  terror: TerrorExport,
  terrorNameOverride?: string | null
): { id: number; sessionType: string; players: string[]; terrorName: string | null } {
  const contentHash = hashPayload(rawJson);

  const existing = db.prepare('SELECT id FROM terrors WHERE content_hash = ?').get(contentHash) as
    | { id: number }
    | undefined;
  if (existing) {
    throw new DuplicateTerrorError(existing.id);
  }

  const playerNames = new Set<string>();
  for (const row of terror.Experience) playerNames.add(row.Player.trim());
  for (const row of terror.Damage) playerNames.add(row.Player.trim());
  for (const row of terror.Supplies) playerNames.add(row.Player.trim());
  for (const row of terror.Drops) playerNames.add(row.Player.trim());
  for (const row of terror['Enemies Defeated']) playerNames.add(row.Player.trim());

  const insertTerror = () => withTransaction(() => {
    const playerIds = new Map<string, number>();
    for (const name of playerNames) {
      playerIds.set(name, upsertPlayer(name));
    }

    const primaryPlayerName = [...terror.Experience].sort((a, b) => b.Experience - a.Experience)[0]?.Player.trim();
    const primaryPlayerId = primaryPlayerName ? playerIds.get(primaryPlayerName) ?? null : null;

    const trimmedOverride = terrorNameOverride?.trim();
    const terrorName = trimmedOverride ? trimmedOverride : deriveTerrorName(terror.Damage);

    const session = terror.Session;
    const terrorResult = db
      .prepare(
        `INSERT INTO terrors (
          session_id, terror_name, content_hash, session_type, status, start_time, duration_seconds, paused_seconds,
          kills, kills_per_hour, rare_kills, rare_kills_per_hour, experience, experience_per_hour,
          damage_dealt, damage_dealt_per_second, damage_taken, damage_taken_per_second,
          supplies_cost, supplies_per_hour, raw_gains, raw_gains_per_hour, profit, profit_per_hour,
          time_to_next_level_seconds, primary_player_id, raw_json
        ) VALUES (
          @session_id, @terror_name, @content_hash, @session_type, @status, @start_time, @duration_seconds, @paused_seconds,
          @kills, @kills_per_hour, @rare_kills, @rare_kills_per_hour, @experience, @experience_per_hour,
          @damage_dealt, @damage_dealt_per_second, @damage_taken, @damage_taken_per_second,
          @supplies_cost, @supplies_per_hour, @raw_gains, @raw_gains_per_hour, @profit, @profit_per_hour,
          @time_to_next_level_seconds, @primary_player_id, @raw_json
        )`
      )
      .run({
        session_id: session['Session ID'] ?? null,
        terror_name: terrorName,
        content_hash: contentHash,
        session_type: session['Session type'],
        status: session.Status ?? null,
        start_time: session.Start,
        duration_seconds: session['Duration seconds'],
        paused_seconds: session['Paused seconds'] ?? 0,
        kills: session.Kills,
        kills_per_hour: session['Kills per hour'],
        rare_kills: session['Rare kills'],
        rare_kills_per_hour: session['Rare kills per hour'],
        experience: session.Experience,
        experience_per_hour: session['Experience per hour'],
        damage_dealt: session['Damage dealt'],
        damage_dealt_per_second: session['Damage dealt per second'],
        damage_taken: session['Damage taken'],
        damage_taken_per_second: session['Damage taken per second'],
        supplies_cost: session.Supplies,
        supplies_per_hour: session['Supplies per hour'],
        raw_gains: session['Raw gains'],
        raw_gains_per_hour: session['Raw gains per hour'],
        profit: session.Profit,
        profit_per_hour: session['Profit per hour'],
        time_to_next_level_seconds: session['Time to next level seconds'] ?? null,
        primary_player_id: primaryPlayerId,
        raw_json: rawJson,
      });

    const terrorId = Number(terrorResult.lastInsertRowid);

    const insertTerrorPlayer = db.prepare(
      'INSERT OR IGNORE INTO terror_players (terror_id, player_id) VALUES (?, ?)'
    );
    for (const id of playerIds.values()) {
      insertTerrorPlayer.run(terrorId, id);
    }

    const insertDamage = db.prepare(
      `INSERT INTO terror_damage (terror_id, player_id, enemy, element, damage_dealt, damage_taken)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const row of terror.Damage) {
      insertDamage.run(terrorId, playerIds.get(row.Player.trim()) ?? null, row.Enemy, row.Element, row['Damage dealt'], row['Damage taken']);
    }

    const insertSupplies = db.prepare(
      `INSERT INTO terror_supplies (terror_id, player_id, item, item_normalized, count, unit_price, total_price, ignored)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of terror.Supplies) {
      insertSupplies.run(
        terrorId,
        playerIds.get(row.Player.trim()) ?? null,
        row.Item,
        normalizeItemName(row.Item),
        row.Count,
        row['Unit price'],
        row['Total price'],
        row.Ignored === null || row.Ignored === undefined ? null : row.Ignored ? 1 : 0
      );
    }

    const insertDrops = db.prepare(
      `INSERT INTO terror_drops (terror_id, player_id, item, item_normalized, count, unit_price, total_price, ignored)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of terror.Drops) {
      insertDrops.run(
        terrorId,
        playerIds.get(row.Player.trim()) ?? null,
        row.Item,
        normalizeItemName(row.Item),
        row.Count,
        row['Unit price'],
        row['Total price'],
        row.Ignored === null || row.Ignored === undefined ? null : row.Ignored ? 1 : 0
      );
    }

    const insertExperience = db.prepare(
      'INSERT INTO terror_experience (terror_id, player_id, experience) VALUES (?, ?, ?)'
    );
    for (const row of terror.Experience) {
      insertExperience.run(terrorId, playerIds.get(row.Player.trim()) ?? null, row.Experience);
    }

    const insertEnemies = db.prepare(
      `INSERT INTO terror_enemies_defeated (terror_id, player_id, enemy, count, rare, ignored)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const row of terror['Enemies Defeated']) {
      insertEnemies.run(
        terrorId,
        playerIds.get(row.Player.trim()) ?? null,
        row.Enemy,
        row.Count,
        row.Rare ? 1 : 0,
        row.Ignored === null || row.Ignored === undefined ? null : row.Ignored ? 1 : 0
      );
    }

    return { id: terrorId, sessionType: session['Session type'], players: [...playerNames], terrorName };
  });

  return insertTerror();
}
