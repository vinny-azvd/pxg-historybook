import { getDb, META_KEY, defaultMeta, type MetaRecord } from './db';
import type { StoredPlayer, StoredHunt, StoredTerror, StoredMd } from './storedTypes';
import type { Player } from '../types';

/** Upserts every name in `names` into the `players` store (by the unique
 * `name` index), assigning ids from the `meta.nextPlayerId` counter for new
 * ones. Each upsert does its id-bump + put() in one transaction, processed
 * sequentially so two upserts never race against the same counter value
 * within this call. */
export async function upsertPlayers(names: Set<string>): Promise<Map<string, number>> {
  const db = await getDb();
  const result = new Map<string, number>();

  for (const rawName of names) {
    const trimmed = rawName.trim();
    const tx = db.transaction(['players', 'meta'], 'readwrite');
    const playersStore = tx.objectStore('players');
    const metaStore = tx.objectStore('meta');

    const existing = (await playersStore.index('name').get(trimmed)) as StoredPlayer | undefined;
    if (existing) {
      result.set(trimmed, existing.id);
      await tx.done;
      continue;
    }

    const meta = ((await metaStore.get(META_KEY)) as MetaRecord | undefined) ?? defaultMeta();
    const newId = meta.nextPlayerId;
    meta.nextPlayerId = newId + 1;
    await metaStore.put(meta, META_KEY);

    const player: StoredPlayer = { id: newId, name: trimmed, created_at: new Date().toISOString() };
    await playersStore.put(player);
    result.set(trimmed, newId);
    await tx.done;
  }

  return result;
}

/** Mirrors players.ts's route: only players that appear in at least one
 * imported hunt/terror/md, sorted case-insensitively by name. */
export async function listPlayersWithContentCounts(): Promise<Player[]> {
  const db = await getDb();
  const [players, hunts, terrors, mds] = await Promise.all([
    db.getAll('players') as Promise<StoredPlayer[]>,
    db.getAll('hunts') as Promise<StoredHunt[]>,
    db.getAll('terrors') as Promise<StoredTerror[]>,
    db.getAll('mds') as Promise<StoredMd[]>,
  ]);

  const huntCountByPlayer = new Map<number, number>();
  const hasContentByPlayer = new Set<number>();
  for (const h of hunts) {
    for (const p of h.players) {
      huntCountByPlayer.set(p.id, (huntCountByPlayer.get(p.id) ?? 0) + 1);
      hasContentByPlayer.add(p.id);
    }
  }
  for (const t of terrors) for (const p of t.players) hasContentByPlayer.add(p.id);
  for (const m of mds) for (const p of m.players) hasContentByPlayer.add(p.id);

  return players
    .filter((p) => hasContentByPlayer.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, huntCount: huntCountByPlayer.get(p.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
