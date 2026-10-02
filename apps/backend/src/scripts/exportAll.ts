import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolved from this script's own location (apps/backend/src/scripts) so the
// output always lands in <repo-root>/backups regardless of what DB_PATH points
// to (it's meant to be run with DB_PATH overridden to a backups/*.sqlite3 copy).
const backupsDir = path.resolve(__dirname, '../../../../backups');

const SCHEMA_VERSION = 1;

type Family = 'hunt' | 'terror' | 'md';

const FAMILY_CONFIG: Record<Family, { table: string; nameColumn: string; hasJadeTotem: boolean; hasDifficulty: boolean; hasNightmareCrystal: boolean }> = {
  hunt: { table: 'hunts', nameColumn: 'hunt_name', hasJadeTotem: true, hasDifficulty: false, hasNightmareCrystal: true },
  terror: { table: 'terrors', nameColumn: 'terror_name', hasJadeTotem: false, hasDifficulty: false, hasNightmareCrystal: false },
  md: { table: 'mds', nameColumn: 'md_name', hasJadeTotem: false, hasDifficulty: true, hasNightmareCrystal: false },
};

console.log(`Opening ${DB_PATH}`);
const db = new DatabaseSync(DB_PATH, { readOnly: true });

function count(table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

function exportFamily(family: Family) {
  const cfg = FAMILY_CONFIG[family];
  const prefix = cfg.table.slice(0, -1); // 'hunts' -> 'hunt', 'terrors' -> 'terror', 'mds' -> 'md'

  const mainRows = db.prepare(`SELECT * FROM ${cfg.table} ORDER BY id`).all() as Record<string, unknown>[];

  const playersStmt = db.prepare(
    `SELECT p.id, p.name FROM ${prefix}_players hp JOIN players p ON p.id = hp.player_id WHERE hp.${prefix}_id = ? ORDER BY p.name`
  );
  const damageStmt = db.prepare(
    `SELECT d.*, p.name AS player_name FROM ${prefix}_damage d LEFT JOIN players p ON p.id = d.player_id WHERE d.${prefix}_id = ?`
  );
  const suppliesStmt = db.prepare(
    `SELECT s.*, p.name AS player_name, ii.icon_url
     FROM ${prefix}_supplies s
     LEFT JOIN players p ON p.id = s.player_id
     LEFT JOIN item_icons ii ON ii.name_normalized = s.item_normalized
     WHERE s.${prefix}_id = ?`
  );
  const dropsStmt = db.prepare(
    `SELECT dr.*, p.name AS player_name, ii.icon_url
     FROM ${prefix}_drops dr
     LEFT JOIN players p ON p.id = dr.player_id
     LEFT JOIN item_icons ii ON ii.name_normalized = dr.item_normalized
     WHERE dr.${prefix}_id = ?`
  );
  const experienceStmt = db.prepare(
    `SELECT e.*, p.name AS player_name FROM ${prefix}_experience e LEFT JOIN players p ON p.id = e.player_id WHERE e.${prefix}_id = ?`
  );
  const enemiesStmt = db.prepare(
    `SELECT ed.*, p.name AS player_name FROM ${prefix}_enemies_defeated ed LEFT JOIN players p ON p.id = ed.player_id WHERE ed.${prefix}_id = ?`
  );

  const items = mainRows.map((row) => {
    const id = row.id as number;
    let rawJson: unknown = null;
    if (typeof row.raw_json === 'string') {
      try {
        rawJson = JSON.parse(row.raw_json);
      } catch {
        rawJson = row.raw_json;
      }
    }
    return {
      ...row,
      raw_json: rawJson,
      players: playersStmt.all(id),
      damage: damageStmt.all(id),
      supplies: suppliesStmt.all(id),
      drops: dropsStmt.all(id),
      experience_entries: experienceStmt.all(id),
      enemies_defeated: enemiesStmt.all(id),
    };
  });

  const childCounts = {
    [`${prefix}_players`]: count(`${prefix}_players`),
    [`${prefix}_damage`]: count(`${prefix}_damage`),
    [`${prefix}_supplies`]: count(`${prefix}_supplies`),
    [`${prefix}_drops`]: count(`${prefix}_drops`),
    [`${prefix}_experience`]: count(`${prefix}_experience`),
    [`${prefix}_enemies_defeated`]: count(`${prefix}_enemies_defeated`),
  };

  const assembledChildCounts: Record<string, number> = {
    [`${prefix}_players`]: items.reduce((s, i) => s + i.players.length, 0),
    [`${prefix}_damage`]: items.reduce((s, i) => s + i.damage.length, 0),
    [`${prefix}_supplies`]: items.reduce((s, i) => s + i.supplies.length, 0),
    [`${prefix}_drops`]: items.reduce((s, i) => s + i.drops.length, 0),
    [`${prefix}_experience`]: items.reduce((s, i) => s + i.experience_entries.length, 0),
    [`${prefix}_enemies_defeated`]: items.reduce((s, i) => s + i.enemies_defeated.length, 0),
  };

  for (const key of Object.keys(childCounts)) {
    if (childCounts[key] !== assembledChildCounts[key]) {
      throw new Error(
        `Count mismatch for ${key}: live DB has ${childCounts[key]}, assembled export has ${assembledChildCounts[key]}`
      );
    }
  }

  const liveMainCount = count(cfg.table);
  if (liveMainCount !== items.length) {
    throw new Error(`Count mismatch for ${cfg.table}: live DB has ${liveMainCount}, assembled export has ${items.length}`);
  }

  return { items, counts: { [cfg.table]: items.length, ...childCounts } };
}

const players = db.prepare('SELECT * FROM players ORDER BY id').all();
const livePlayersCount = count('players');
if (livePlayersCount !== players.length) {
  throw new Error(`Count mismatch for players: live DB has ${livePlayersCount}, assembled export has ${players.length}`);
}

const huntsResult = exportFamily('hunt');
const terrorsResult = exportFamily('terror');
const mdsResult = exportFamily('md');

db.close();

const payload = {
  schemaVersion: SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  sourceDbPath: DB_PATH,
  counts: {
    players: players.length,
    ...huntsResult.counts,
    ...terrorsResult.counts,
    ...mdsResult.counts,
  },
  players,
  hunts: huntsResult.items,
  terrors: terrorsResult.items,
  mds: mdsResult.items,
};

fs.mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(backupsDir, `export-${stamp}.json`);
fs.writeFileSync(dest, JSON.stringify(payload, null, 2));

console.log('Export counts:', payload.counts);
console.log(`Exported -> ${dest}`);
