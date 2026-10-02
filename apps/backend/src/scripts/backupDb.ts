import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolved from this script's own location (apps/backend/src/scripts), not
// from DB_PATH, so the output always lands in <repo-root>/backups.
const backupsDir = path.resolve(__dirname, '../../../../backups');
fs.mkdirSync(backupsDir, { recursive: true });

console.log(`Opening ${DB_PATH}`);
const db = new DatabaseSync(DB_PATH);

const beforeWalSize = fs.existsSync(`${DB_PATH}-wal`) ? fs.statSync(`${DB_PATH}-wal`).size : 0;
console.log(`WAL size before checkpoint: ${beforeWalSize} bytes`);

const checkpointResult = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as {
  busy: number;
  log: number;
  checkpointed: number;
};
console.log('Checkpoint result:', checkpointResult);

const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
if (integrity.integrity_check !== 'ok') {
  db.close();
  throw new Error(`integrity_check failed: ${JSON.stringify(integrity)}`);
}
console.log('Integrity check: ok');

db.close();

const afterWalSize = fs.existsSync(`${DB_PATH}-wal`) ? fs.statSync(`${DB_PATH}-wal`).size : 0;
console.log(`WAL size after checkpoint: ${afterWalSize} bytes`);
if (afterWalSize > 0) {
  console.warn(
    `WARNING: WAL file is still ${afterWalSize} bytes after a TRUNCATE checkpoint. ` +
      'Another connection may still be open (stop any running backend/dev server) — re-run this script after closing it.'
  );
}
if (checkpointResult.busy !== 0) {
  console.warn('WARNING: checkpoint reported busy=1 — another connection held the database. Re-run after stopping it.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(backupsDir, `hunts-${stamp}.sqlite3`);
fs.copyFileSync(DB_PATH, dest);

const srcSize = fs.statSync(DB_PATH).size;
const destSize = fs.statSync(dest).size;
if (srcSize !== destSize) {
  throw new Error(`Backup copy size mismatch: source ${srcSize} bytes, dest ${destSize} bytes`);
}

console.log(`Backed up ${DB_PATH} -> ${dest} (${destSize} bytes)`);
