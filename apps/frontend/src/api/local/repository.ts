import { getDb, META_KEY, defaultMeta, type MetaRecord } from './db';

type StoreName = 'hunts' | 'terrors' | 'mds';
type IdCounterKey = 'nextHuntId' | 'nextTerrorId' | 'nextMdId';

/** Generic repository shared by the hunts/terrors/mds stores - the few real
 * per-family differences (hunt_name vs terror_name vs md_name, jade totem /
 * Nightmare Crystal fields only on hunts, difficulty only on md) are handled
 * by the callers (ingestion/ingest.ts, localApi.ts), not here. */
export function createLocalRepository<T extends { id: number; content_hash: string }>(storeName: StoreName) {
  return {
    async list(): Promise<T[]> {
      const db = await getDb();
      return (await db.getAll(storeName)) as T[];
    },

    async get(id: number): Promise<T | undefined> {
      const db = await getDb();
      return (await db.get(storeName, id)) as T | undefined;
    },

    async findByHash(hash: string): Promise<T | undefined> {
      const db = await getDb();
      return (await db.getFromIndex(storeName, 'content_hash', hash)) as T | undefined;
    },

    /** Assigns the next id from the `meta` counters and writes the full
     * document in the SAME IndexedDB transaction, so two tabs importing at
     * the same time can't both grab the same id - IndexedDB serializes
     * transactions that touch the same stores automatically. */
    async insert(doc: Omit<T, 'id'>, idCounterKey: IdCounterKey): Promise<number> {
      const db = await getDb();
      const tx = db.transaction(['meta', storeName], 'readwrite');
      const metaStore = tx.objectStore('meta');
      const targetStore = tx.objectStore(storeName);

      const meta = ((await metaStore.get(META_KEY)) as MetaRecord | undefined) ?? defaultMeta();
      const newId = meta[idCounterKey];
      meta[idCounterKey] = newId + 1;
      await metaStore.put(meta, META_KEY);

      const full = { ...doc, id: newId } as unknown as T;
      await targetStore.put(full);

      await tx.done;
      return newId;
    },

    async rename(id: number, field: string, value: string): Promise<T | undefined> {
      const db = await getDb();
      const existing = (await db.get(storeName, id)) as T | undefined;
      if (!existing) return undefined;
      const updated = { ...existing, [field]: value } as T;
      await db.put(storeName, updated);
      return updated;
    },

    async remove(id: number): Promise<boolean> {
      const db = await getDb();
      const existing = await db.get(storeName, id);
      if (!existing) return false;
      await db.delete(storeName, id);
      return true;
    },
  };
}
