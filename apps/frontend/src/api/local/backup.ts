// Read/write primitives for the full local dataset - underlying a future
// Import/Export page (out of scope for this task), but living here since
// they belong with the rest of the data layer.
import { getDb, META_KEY, withMetaDefaults, type MetaRecord } from './db';
import type { StoredHunt, StoredItemRow, StoredMd, StoredPlayer, StoredShinyLegacy, StoredTerror } from './storedTypes';
import { sum } from './aggregation/shared';
import { getIconUrl, loadIcons } from './icons';

// Stays 1 though exports now carry `shinyLegacy`: it is an extra top-level
// array, which an older build's importFromJson simply ignores, and a backup
// without it still imports here - nothing an old reader relies on changed.
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
  const [players, hunts, terrors, mds, shinyLegacy] = await Promise.all([
    db.getAll('players') as Promise<StoredPlayer[]>,
    db.getAll('hunts') as Promise<StoredHunt[]>,
    db.getAll('terrors') as Promise<StoredTerror[]>,
    db.getAll('mds') as Promise<StoredMd[]>,
    db.getAll('shinyLegacy') as Promise<StoredShinyLegacy[]>,
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
      shinyLegacy: shinyLegacy.length,
    },
    players,
    hunts: hunts.map(toExportItem),
    terrors: terrors.map(toExportItem),
    mds: mds.map(toExportItem),
    shinyLegacy,
  };
}

export interface MergeStoreResult {
  imported: number;
  skipped: number;
}

export interface MergeSummary {
  players: { added: number; matched: number };
  hunts: MergeStoreResult;
  terrors: MergeStoreResult;
  mds: MergeStoreResult;
  shinyLegacy: MergeStoreResult;
  /** Rows of the backup that could not be used (not objects, no content_hash,
   * unreadable legacy rows): counted so nothing disappears silently. */
  dropped: number;
}

export interface ImportResult {
  counts: Record<string, number>;
  /** Present for mode 'merge' only. */
  merge?: MergeSummary;
}

type Row = Record<string, any>;

const isRow = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : []);

/** Merges the backup into data that already exists here, in ONE transaction
 * (any failure aborts it, so nothing ends up half-merged). Ids of the backup
 * are never reused: they come from another database and would collide. They
 * only serve to translate references (backup player id -> local player id).
 * Local rows always win; a duplicate (same content_hash) is skipped. */
async function mergeIntoExisting(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    players: unknown[];
    hunts: unknown[];
    terrors: unknown[];
    mds: unknown[];
    shinyLegacy: StoredShinyLegacy[];
    droppedLegacy: number;
    toStoredDoc: (row: Row) => Row;
  }
): Promise<ImportResult> {
  const tx = db.transaction(['players', 'hunts', 'terrors', 'mds', 'shinyLegacy', 'meta'], 'readwrite');
  try {
    const meta = withMetaDefaults((await tx.objectStore('meta').get(META_KEY)) as Partial<MetaRecord> | undefined);
    const maxId = (rows: { id?: unknown }[]) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
    const [localPlayers, localHunts, localTerrors, localMds, localLegacy] = (await Promise.all([
      tx.objectStore('players').getAll(),
      tx.objectStore('hunts').getAll(),
      tx.objectStore('terrors').getAll(),
      tx.objectStore('mds').getAll(),
      tx.objectStore('shinyLegacy').getAll(),
    ])) as [StoredPlayer[], StoredHunt[], StoredTerror[], StoredMd[], StoredShinyLegacy[]];

    // Counters never go below the data already here, even if meta was stale.
    let nextPlayer = Math.max(meta.nextPlayerId, maxId(localPlayers) + 1);
    let nextHunt = Math.max(meta.nextHuntId, maxId(localHunts) + 1);
    let nextTerror = Math.max(meta.nextTerrorId, maxId(localTerrors) + 1);
    let nextMd = Math.max(meta.nextMdId, maxId(localMds) + 1);
    let nextLegacy = Math.max(meta.nextShinyLegacyId, maxId(localLegacy) + 1);

    let dropped = input.droppedLegacy;
    const writes: (() => Promise<unknown>)[] = [];
    const playersStore = tx.objectStore('players');

    // Players: same rule as upsertPlayers (exact trimmed name).
    const byName = new Map<string, number>(localPlayers.map((p) => [p.name.trim(), p.id]));
    const idMap = new Map<number, number>();
    let added = 0;
    let matched = 0;
    const ensurePlayer = (rawName: string, createdAt?: unknown): number => {
      const name = rawName.trim();
      const known = byName.get(name);
      if (known !== undefined) return known;
      const id = nextPlayer++;
      byName.set(name, id);
      added++;
      const player: StoredPlayer = { id, name, created_at: typeof createdAt === 'string' ? createdAt : new Date().toISOString() };
      writes.push(() => playersStore.put(player));
      return id;
    };
    const seenBackupPlayers = new Set<number>();
    for (const p of arr(input.players)) {
      if (typeof p.name !== 'string' || p.name.trim() === '' || typeof p.id !== 'number') {
        dropped++;
        continue;
      }
      if (seenBackupPlayers.has(p.id)) continue;
      seenBackupPlayers.add(p.id);
      const existedBefore = byName.has(p.name.trim());
      idMap.set(p.id, ensurePlayer(p.name, p.created_at));
      if (existedBefore) matched++;
    }

    // Translates one player reference. The name is a fallback for references
    // whose id the backup's player list does not hold; unresolved -> null.
    const mapRef = (id: unknown, name: unknown): number | null => {
      if (typeof id === 'number' && idMap.has(id)) return idMap.get(id)!;
      if (typeof name === 'string' && byName.has(name.trim())) return byName.get(name.trim())!;
      return null;
    };
    const mapRows = (rows: unknown): Row[] =>
      Array.isArray(rows) ? rows.filter(isRow).map((r) => ({ ...r, player_id: mapRef(r.player_id, r.player_name) })) : [];

    const mergeSessions = (
      storeName: 'hunts' | 'terrors' | 'mds',
      backupRows: unknown[],
      local: (StoredHunt | StoredTerror | StoredMd)[],
      next: () => number
    ): MergeStoreResult => {
      const store = tx.objectStore(storeName);
      const byHash = new Map<string, Row>(local.map((r) => [r.content_hash, r as Row]));
      const result: MergeStoreResult = { imported: 0, skipped: 0 };
      for (const row of backupRows) {
        if (!isRow(row) || typeof row.content_hash !== 'string' || row.content_hash === '') {
          dropped++;
          continue;
        }
        const existing = byHash.get(row.content_hash);
        if (existing) {
          result.skipped++;
          // The only thing a duplicate can still add: the shiny target the
          // local copy was never told about.
          if (storeName === 'hunts' && !existing.shiny_target && typeof row.shiny_target === 'string' && row.shiny_target) {
            existing.shiny_target = row.shiny_target;
            writes.push(() => store.put(existing));
          }
          continue;
        }
        const doc = input.toStoredDoc(row);
        const players = Array.isArray(row.players)
          ? row.players
              .filter((m): m is Row => isRow(m) && typeof m.name === 'string' && m.name.trim() !== '')
              .map((m) => ({ id: mapRef(m.id, m.name) ?? ensurePlayer(m.name), name: m.name }))
          : [];
        const merged: Row = {
          ...doc,
          id: next(),
          primary_player_id: mapRef(
            row.primary_player_id,
            Array.isArray(row.players)
              ? (row.players.find((m) => isRow(m) && m.id === row.primary_player_id) as Row | undefined)?.name
              : null
          ),
          players,
          damage: mapRows(doc.damage),
          supplies: mapRows(doc.supplies),
          drops: mapRows(doc.drops),
          experience_entries: mapRows(doc.experience_entries),
          enemies_defeated: mapRows(row.enemies_defeated),
        };
        byHash.set(row.content_hash, merged);
        writes.push(() => store.put(merged));
        result.imported++;
      }
      return result;
    };

    const huntsRes = mergeSessions('hunts', input.hunts, localHunts, () => nextHunt++);
    const terrorsRes = mergeSessions('terrors', input.terrors, localTerrors, () => nextTerror++);
    const mdsRes = mergeSessions('mds', input.mds, localMds, () => nextMd++);

    const legacyStore = tx.objectStore('shinyLegacy');
    const legacyHashes = new Set(localLegacy.map((r) => r.content_hash));
    const legacyRes: MergeStoreResult = { imported: 0, skipped: 0 };
    for (const r of input.shinyLegacy) {
      if (legacyHashes.has(r.content_hash)) {
        legacyRes.skipped++;
        continue;
      }
      legacyHashes.add(r.content_hash);
      const row: StoredShinyLegacy = { ...r, id: nextLegacy++, player_id: mapRef(r.player_id, null) };
      writes.push(() => legacyStore.put(row));
      legacyRes.imported++;
    }

    for (const w of writes) await w();
    await tx.objectStore('meta').put(
      {
        ...meta,
        nextHuntId: nextHunt,
        nextTerrorId: nextTerror,
        nextMdId: nextMd,
        nextPlayerId: nextPlayer,
        nextShinyLegacyId: nextLegacy,
      } satisfies MetaRecord,
      META_KEY
    );
    await tx.done;

    return {
      counts: {
        players: added,
        hunts: huntsRes.imported,
        terrors: terrorsRes.imported,
        mds: mdsRes.imported,
        shinyLegacy: legacyRes.imported,
      },
      merge: { players: { added, matched }, hunts: huntsRes, terrors: terrorsRes, mds: mdsRes, shinyLegacy: legacyRes, dropped },
    };
  } catch (err) {
    // Without an explicit abort, requests already queued would still commit.
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => {});
    throw err;
  }
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

  // Merge drops (and counts) rows it cannot use; replace keeps its original,
  // unfiltered behaviour.
  let droppedRows = 0;
  const pick = <T,>(v: unknown, usable: (r: Row) => boolean): T[] => {
    const list = Array.isArray(v) ? v : [];
    if (mode !== 'merge') return list as T[];
    const kept = list.filter((r) => isRow(r) && usable(r));
    droppedRows += list.length - kept.length;
    return kept as T[];
  };
  const hasHash = (r: Row) => typeof r.content_hash === 'string' && r.content_hash !== '';
  const players = pick<StoredPlayer>(body.players, (r) => typeof r.id === 'number' && typeof r.name === 'string' && r.name.trim() !== '');
  const hunts = pick<Record<string, unknown>>(body.hunts, hasHash);
  const terrors = pick<Record<string, unknown>>(body.terrors, hasHash);
  const mds = pick<Record<string, unknown>>(body.mds, hasHash);
  // Absent in backups made before the legacy history store existed. Rows the store
  // can't key or the Shinies stats can't read (hand-edited or damaged files)
  // are dropped here instead of breaking the whole tab later.
  const isCount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const rawLegacy = Array.isArray(body.shinyLegacy) ? body.shinyLegacy : [];
  const shinyLegacy = rawLegacy.filter((row): row is StoredShinyLegacy => {
    if (row === null || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    return (
      Number.isSafeInteger(r.id) &&
      typeof r.content_hash === 'string' &&
      typeof r.start_time === 'string' &&
      typeof r.pokemon === 'string' &&
      r.pokemon.trim() !== '' &&
      isCount(r.kills) &&
      isCount(r.shinies) &&
      isCount(r.duration_seconds) &&
      isCount(r.companion_shinies) &&
      (r.companion === null || typeof r.companion === 'string')
    );
  });

  const db = await getDb();
  let realMerge = false;

  if (mode === 'merge') {
    const [playerCount, huntCount, terrorCount, mdCount, legacyCount] = await Promise.all([
      db.count('players'),
      db.count('hunts'),
      db.count('terrors'),
      db.count('mds'),
      db.count('shinyLegacy'),
    ]);
    if (playerCount > 0 || huntCount > 0 || terrorCount > 0 || mdCount > 0 || legacyCount > 0) {
      // Non-empty: real merge, run below once the helpers exist. (Empty falls
      // through to the plain insert, which keeps the backup's own ids, as
      // merging always did here.)
      realMerge = true;
    }
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
      ? (rows as StoredItemRow[]).filter(isRow).map((row) => ({ ...row, icon_url: getIconUrl(row.item_normalized) }))
      : [];

  const toStoredDoc = (row: Record<string, unknown>) => ({
    ...row,
    raw_json: typeof row.raw_json === 'string' ? row.raw_json : JSON.stringify(row.raw_json ?? null),
    supplies: withResolvedIcons(row.supplies),
    drops: withResolvedIcons(row.drops),
  });

  if (realMerge) {
    return mergeIntoExisting(db, {
      players,
      hunts,
      terrors,
      mds,
      shinyLegacy,
      droppedLegacy: droppedRows + rawLegacy.length - shinyLegacy.length,
      toStoredDoc,
    });
  }

  const tx = db.transaction(['players', 'hunts', 'terrors', 'mds', 'shinyLegacy', 'meta'], 'readwrite');
  // A failed write aborts the transaction and the error is thrown below; this
  // keeps the matching `tx.done` rejection from also surfacing as an unhandled one.
  void tx.done.catch(() => undefined);
  if (mode === 'replace') {
    // Cleared inside the same transaction as the inserts (and after loadIcons,
    // which can fail on the network): a bad backup aborts the whole thing and
    // the data that was here stays, instead of being wiped first.
    await Promise.all(
      ['players', 'hunts', 'terrors', 'mds', 'shinyLegacy'].map((name) => tx.objectStore(name).clear())
    );
  }
  const playersStore = tx.objectStore('players');
  for (const p of players) await playersStore.put(p);

  const huntsStore = tx.objectStore('hunts');
  for (const h of hunts) await huntsStore.put(toStoredDoc(h));

  const terrorsStore = tx.objectStore('terrors');
  for (const t of terrors) await terrorsStore.put(toStoredDoc(t));

  const mdsStore = tx.objectStore('mds');
  for (const m of mds) await mdsStore.put(toStoredDoc(m));

  const legacyStore = tx.objectStore('shinyLegacy');
  for (const r of shinyLegacy) await legacyStore.put(r);

  const metaStore = tx.objectStore('meta');
  const maxId = (rows: { id?: unknown }[]) =>
    rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const existingMeta = withMetaDefaults((await metaStore.get(META_KEY)) as Partial<MetaRecord> | undefined);
  const newMeta: MetaRecord = {
    nextHuntId: Math.max(existingMeta.nextHuntId, maxId(hunts) + 1),
    nextTerrorId: Math.max(existingMeta.nextTerrorId, maxId(terrors) + 1),
    nextMdId: Math.max(existingMeta.nextMdId, maxId(mds) + 1),
    nextPlayerId: Math.max(existingMeta.nextPlayerId, maxId(players) + 1),
    nextShinyLegacyId: Math.max(existingMeta.nextShinyLegacyId, maxId(shinyLegacy) + 1),
    iconsSeededAt: existingMeta.iconsSeededAt,
  };
  await metaStore.put(newMeta, META_KEY);

  await tx.done;

  const counts = {
    players: players.length,
    hunts: hunts.length,
    terrors: terrors.length,
    mds: mds.length,
    shinyLegacy: shinyLegacy.length,
  };
  if (mode === 'merge') {
    // Merge into an empty browser: everything is new.
    const all = (n: number): MergeStoreResult => ({ imported: n, skipped: 0 });
    return {
      counts,
      merge: {
        players: { added: players.length, matched: 0 },
        hunts: all(hunts.length),
        terrors: all(terrors.length),
        mds: all(mds.length),
        shinyLegacy: all(shinyLegacy.length),
        dropped: droppedRows + rawLegacy.length - shinyLegacy.length,
      },
    };
  }
  return { counts };
}
