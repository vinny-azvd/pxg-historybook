import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';
import { deriveHuntName } from '../services/huntNaming.js';
import { deriveTerrorName } from '../services/terrorNaming.js';
import { deriveMdName } from '../services/mdNaming.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  const columns = db.prepare('PRAGMA table_info(hunts)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'hunt_name')) {
    db.exec('ALTER TABLE hunts ADD COLUMN hunt_name TEXT');
  }
  if (!columns.some((c) => c.name === 'jade_totem_count')) {
    db.exec('ALTER TABLE hunts ADD COLUMN jade_totem_count INTEGER NOT NULL DEFAULT 0');
  }

  const enemyColumns = db.prepare('PRAGMA table_info(hunt_enemies_defeated)').all() as { name: string }[];
  if (!enemyColumns.some((c) => c.name === 'from_nightmare_crystal')) {
    db.exec('ALTER TABLE hunt_enemies_defeated ADD COLUMN from_nightmare_crystal INTEGER NOT NULL DEFAULT 0');
  }

  const mdColumns = db.prepare('PRAGMA table_info(mds)').all() as { name: string }[];
  if (!mdColumns.some((c) => c.name === 'difficulty')) {
    db.exec(
      "ALTER TABLE mds ADD COLUMN difficulty TEXT CHECK (difficulty IN ('Grand Master', 'Master', 'Hyper', 'Ultra', 'Platinum'))"
    );
  }

  backfillHuntNames();
  backfillTerrorNames();
  backfillMdNames();
  recomputeJadeTotemCounts();
}

function backfillHuntNames() {
  const missing = db
    .prepare('SELECT id FROM hunts WHERE hunt_name IS NULL')
    .all() as { id: number }[];
  if (missing.length === 0) return;

  const enemiesStmt = db.prepare('SELECT enemy, count FROM hunt_enemies_defeated WHERE hunt_id = ?');
  const updateStmt = db.prepare('UPDATE hunts SET hunt_name = ? WHERE id = ?');

  for (const { id } of missing) {
    const enemies = enemiesStmt.all(id) as { enemy: string; count: number }[];
    const huntName = deriveHuntName(enemies);
    if (huntName) updateStmt.run(huntName, id);
  }
}

function backfillTerrorNames() {
  const missing = db
    .prepare('SELECT id FROM terrors WHERE terror_name IS NULL')
    .all() as { id: number }[];
  if (missing.length === 0) return;

  const damageStmt = db.prepare('SELECT enemy AS "Enemy" FROM terror_damage WHERE terror_id = ?');
  const updateStmt = db.prepare('UPDATE terrors SET terror_name = ? WHERE id = ?');

  for (const { id } of missing) {
    const damage = damageStmt.all(id) as { Enemy: string }[];
    const terrorName = deriveTerrorName(damage);
    if (terrorName) updateStmt.run(terrorName, id);
  }
}

function backfillMdNames() {
  const missing = db
    .prepare('SELECT id FROM mds WHERE md_name IS NULL')
    .all() as { id: number }[];
  if (missing.length === 0) return;

  const damageStmt = db.prepare('SELECT enemy AS "Enemy" FROM md_damage WHERE md_id = ?');
  const updateStmt = db.prepare('UPDATE mds SET md_name = ? WHERE id = ?');

  for (const { id } of missing) {
    const damage = damageStmt.all(id) as { Enemy: string }[];
    const mdName = deriveMdName(damage);
    if (mdName) updateStmt.run(mdName, id);
  }
}

// Recomputed on every startup (not just once) so a later fix to what counts as
// a "jade totem" item (e.g. discovering a new name variant) self-heals for
// hunts imported before the fix, instead of leaving them stuck at whatever
// was detected at import time.
function recomputeJadeTotemCounts() {
  db.exec(`
    UPDATE hunts SET jade_totem_count = (
      SELECT COALESCE(SUM(count), 0) FROM (
        SELECT count FROM hunt_supplies
         WHERE hunt_id = hunts.id AND item_normalized LIKE '%jade%' AND item_normalized LIKE '%totem%'
        UNION ALL
        SELECT count FROM hunt_drops
         WHERE hunt_id = hunts.id AND item_normalized LIKE '%jade%' AND item_normalized LIKE '%totem%'
      )
    )
  `);
}
