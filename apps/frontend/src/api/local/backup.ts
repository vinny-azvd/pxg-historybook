// Read/write primitives for the full local dataset - underlying a future
// Import/Export page (out of scope for this task), but living here since
// they belong with the rest of the data layer.
import { getDb, META_KEY, defaultMeta, type MetaRecord } from './db';
import type { StoredHunt, StoredItemRow, StoredMd, StoredPlayer, StoredTerror } from './storedTypes';
import { sum } from './aggregation/shared';
import { getIconUrl, loadIcons } from './icons';

const SCHEMA_VERSION = 1;

function safeParseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toExportItem<T extends { raw_json: string }>(doc: T): Omit<T, 'raw_json'> & { raw_json: unknown } {
  return { ...doc, raw_json: safeParseJson(doc.raw_json) };
}

/** Reads every real-data store and returns the same shape
 * apps/backend/src/scripts/exportAll.ts produces (minus `sourceDbPath`,
 * which only makes sense for a file-backed SQLite database and has no
 * equivalent when the data lives in the browser's IndexedDB). */
export async function exportAllAsJson(): Promise<object> {
  const db = await getDb();
  const [players, hunts, terrors, mds] = await Promise.all([
    db.getAll('players') as Promise<StoredPlayer[]>,
    db.getAll('hunts') as Promise<StoredHunt[]>,
    db.getAll('terrors') as Promise<StoredTerror[]>,
    db.getAll('mds') as Promise<StoredMd[]>,
  ]);

  const childCounts = (items: { players: unknown[]; damage: unknown[]; supplies: unknown[]; drops: unknown[]; experience_entries: unknown[]; enemies_defeated: unknown[] }[], prefix: string) => ({
    [`${prefix}_players`]: sum(items, (i) => i.players.length),
    [`${prefix}_damage`]: sum(items, (i) => i.damage.length),
    [`${prefix}_supplies`]: sum(items, (i) => i.supplies.length),
    [`${prefix}_drops`]: sum(items, (i) => i.drops.length),
    [`${prefix}_experience`]: sum(items, (i) => i.experience_entries.length),
    [`${prefix}_enemies_defeated`]: sum(items, (i) => i.enemies_defeated.length),
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      players: players.length,
      hunts: hunts.length,
      ...childCounts(hunts, 'hunt'),
      terrors: terrors.length,
      ...childCounts(terrors, 'terror'),
      mds: mds.length,
      ...childCounts(mds, 'md'),
    },
    players,
    hunts: hunts.map(toExportItem),
    terrors: terrors.map(toExportItem),
    mds: mds.map(toExportItem),
  };
}

export interface ImportResult {
  counts: Record<string, number>;
}

/** Validates the top-level export shape, then either rejects (mode 'merge')
 * if any of the 4 real-data stores already hold something, or clears all 4
 * (mode 'replace') before inserting everything - preserving the original
 * ids from the export rather than reassigning new ones, and bumping the
 * `meta` counters so future ingests don't collide with the imported ids. */
export async function importFromJson(payload: unknown, mode: 'merge' | 'replace'): Promise<ImportResult> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Formato de import inválido: esperado um objeto JSON.');
  }
  const body = payload as Record<string, unknown>;
  if (typeof body.schemaVersion !== 'number') {
    throw new Error('Formato de import inválido: schemaVersion ausente.');
  }

  const players = Array.isArray(body.players) ? (body.players as StoredPlayer[]) : [];
  const hunts = Array.isArray(body.hunts) ? (body.hunts as Record<string, unknown>[]) : [];
  const terrors = Array.isArray(body.terrors) ? (body.terrors as Record<string, unknown>[]) : [];
  const mds = Array.isArray(body.mds) ? (body.mds as Record<string, unknown>[]) : [];

  const db = await getDb();

  if (mode === 'merge') {
    const [playerCount, huntCount, terrorCount, mdCount] = await Promise.all([
      db.count('players'),
      db.count('hunts'),
      db.count('terrors'),
      db.count('mds'),
    ]);
    if (playerCount > 0 || huntCount > 0 || terrorCount > 0 || mdCount > 0) {
      throw new Error(
        'Os dados locais não estão vazios. Use "Substituir tudo" ou limpe os dados antes de mesclar.'
      );
    }
  } else {
    await Promise.all([db.clear('players'), db.clear('hunts'), db.clear('terrors'), db.clear('mds')]);
  }

  // icon_url is a derived field (resolved from the bundled icon database, not
  // real session data) - older exports may not have it at all (it was added
  // after the first backend export script), and even when present it should
  // reflect whatever icon set THIS build ships, not whatever was true when
  // the backup was made. Always recompute it from item_normalized on import
  // rather than trusting the payload.
  await loadIcons();
  const withResolvedIcons = (rows: unknown): StoredItemRow[] =>
    Array.isArray(rows)
      ? (rows as StoredItemRow[]).map((row) => ({ ...row, icon_url: getIconUrl(row.item_normalized) }))
      : [];

  const toStoredDoc = (row: Record<string, unknown>) => ({
    ...row,
    raw_json: typeof row.raw_json === 'string' ? row.raw_json : JSON.stringify(row.raw_json ?? null),
    supplies: withResolvedIcons(row.supplies),
    drops: withResolvedIcons(row.drops),
  });

  const tx = db.transaction(['players', 'hunts', 'terrors', 'mds', 'meta'], 'readwrite');
  const playersStore = tx.objectStore('players');
  for (const p of players) await playersStore.put(p);

  const huntsStore = tx.objectStore('hunts');
  for (const h of hunts) await huntsStore.put(toStoredDoc(h));

  const terrorsStore = tx.objectStore('terrors');
  for (const t of terrors) await terrorsStore.put(toStoredDoc(t));

  const mdsStore = tx.objectStore('mds');
  for (const m of mds) await mdsStore.put(toStoredDoc(m));

  const metaStore = tx.objectStore('meta');
  const maxId = (rows: { id?: unknown }[]) =>
    rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const existingMeta = ((await metaStore.get(META_KEY)) as MetaRecord | undefined) ?? defaultMeta();
  const newMeta: MetaRecord = {
    nextHuntId: Math.max(existingMeta.nextHuntId, maxId(hunts) + 1),
    nextTerrorId: Math.max(existingMeta.nextTerrorId, maxId(terrors) + 1),
    nextMdId: Math.max(existingMeta.nextMdId, maxId(mds) + 1),
    nextPlayerId: Math.max(existingMeta.nextPlayerId, maxId(players) + 1),
    iconsSeededAt: existingMeta.iconsSeededAt,
  };
  await metaStore.put(newMeta, META_KEY);

  await tx.done;

  return {
    counts: {
      players: players.length,
      hunts: hunts.length,
      terrors: terrors.length,
      mds: mds.length,
    },
  };
}
