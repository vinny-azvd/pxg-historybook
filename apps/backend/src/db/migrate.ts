import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';
import { deriveHuntName } from '../services/huntNaming.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  const columns = db.prepare('PRAGMA table_info(hunts)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'hunt_name')) {
    db.exec('ALTER TABLE hunts ADD COLUMN hunt_name TEXT');
  }

  backfillHuntNames();
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
