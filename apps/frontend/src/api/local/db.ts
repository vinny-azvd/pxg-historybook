import { openDB, type IDBPDatabase } from 'idb';

// Not using idb's typed DBSchema generic here on purpose: the generic
// repository factory in repository.ts needs to operate over any of the
// hunts/terrors/mds stores through a single type parameter, which doesn't
// mix well with idb's literal-keyed schema typing. Store values are typed at
// the boundary (repository.ts, players.ts, backup.ts) via assertions against
// the real StoredHunt/StoredTerror/StoredMd/StoredPlayer types instead - the
// same pattern the backend already uses for raw SQLite rows (`as any` casts
// in statsAggregation.ts etc.), just applied at the IndexedDB boundary.

export interface MetaRecord {
  nextHuntId: number;
  nextTerrorId: number;
  nextMdId: number;
  nextPlayerId: number;
  iconsSeededAt: string | null;
}

export const META_KEY = 'counters';

const DB_NAME = 'pxg-hunts';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const players = db.createObjectStore('players', { keyPath: 'id' });
        players.createIndex('name', 'name', { unique: true });

        const hunts = db.createObjectStore('hunts', { keyPath: 'id' });
        hunts.createIndex('content_hash', 'content_hash', { unique: true });
        hunts.createIndex('start_time', 'start_time');

        const terrors = db.createObjectStore('terrors', { keyPath: 'id' });
        terrors.createIndex('content_hash', 'content_hash', { unique: true });
        terrors.createIndex('start_time', 'start_time');

        const mds = db.createObjectStore('mds', { keyPath: 'id' });
        mds.createIndex('content_hash', 'content_hash', { unique: true });
        mds.createIndex('start_time', 'start_time');

        db.createObjectStore('itemIcons', { keyPath: 'name_normalized' });

        // No keyPath: a single fixed-key record (META_KEY) holds the
        // auto-increment counters, since IndexedDB doesn't expose a
        // "next autoincrement value" you can read before writing.
        db.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

const DEFAULT_META: MetaRecord = {
  nextHuntId: 1,
  nextTerrorId: 1,
  nextMdId: 1,
  nextPlayerId: 1,
  iconsSeededAt: null,
};

export async function getMeta(): Promise<MetaRecord> {
  const db = await getDb();
  const existing = (await db.get('meta', META_KEY)) as MetaRecord | undefined;
  if (existing) return existing;
  await db.put('meta', DEFAULT_META, META_KEY);
  return { ...DEFAULT_META };
}

export function defaultMeta(): MetaRecord {
  return { ...DEFAULT_META };
}
