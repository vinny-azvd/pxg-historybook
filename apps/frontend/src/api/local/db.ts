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
  nextShinyLegacyId: number;
  iconsSeededAt: string | null;
}

export const META_KEY = 'counters';

const DB_NAME = 'pxg-hunts';
// v2 adds the 'shinyLegacy' store (old roulette history). Upgrades are
// incremental on purpose: a browser already on v1 holds the user's real data,
// so only what is missing may be created.
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
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
        }
        if (oldVersion < 2) {
          const legacy = db.createObjectStore('shinyLegacy', { keyPath: 'id' });
          legacy.createIndex('content_hash', 'content_hash', { unique: true });
          legacy.createIndex('start_time', 'start_time');

          // A v1 meta record has no counter for the new store; getMeta and the
          // repository also merge defaults, this just persists it up front.
          const meta = tx.objectStore('meta');
          const existing = (await meta.get(META_KEY)) as Partial<MetaRecord> | undefined;
          if (existing) await meta.put({ ...DEFAULT_META, ...existing }, META_KEY);
        }
      },
      // A newer build in another tab wants to upgrade: close this connection so
      // the upgrade isn't blocked forever; the next call reopens it.
      blocking(_current, _blocked, event) {
        (event.target as IDBDatabase).close();
        dbPromise = null;
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
  nextShinyLegacyId: 1,
  iconsSeededAt: null,
};

/** Merges a stored record over the defaults: records written before a counter
 * existed (v1 had no nextShinyLegacyId) must not read as undefined/NaN. */
export function withMetaDefaults(existing: Partial<MetaRecord> | undefined): MetaRecord {
  return { ...DEFAULT_META, ...existing };
}

export async function getMeta(): Promise<MetaRecord> {
  const db = await getDb();
  const existing = (await db.get('meta', META_KEY)) as Partial<MetaRecord> | undefined;
  const merged = withMetaDefaults(existing);
  if (!existing || merged.nextShinyLegacyId !== existing.nextShinyLegacyId) {
    await db.put('meta', merged, META_KEY);
  }
  return merged;
}

export function defaultMeta(): MetaRecord {
  return { ...DEFAULT_META };
}
