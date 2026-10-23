import { getDb } from './db';
import type { StoredHunt, StoredMd, StoredPlayer, StoredShinyLegacy, StoredTerror } from './storedTypes';

type SessionStore = 'hunts' | 'terrors' | 'mds';
type AnySession = StoredHunt | StoredTerror | StoredMd;

const SESSION_STORES: SessionStore[] = ['hunts', 'terrors', 'mds'];

export interface PlayerDataSummary {
  id: number;
  name: string;
  /** Sessions where this player is the owner of the log (primary player). */
  ownedHunts: number;
  ownedTerrors: number;
  ownedMds: number;
  /** Hunts of the old roulette's history owned by this player (deleted with them). */
  ownedShinyLegacy: number;
  /** Other people's sessions where this player only appears as a party member (deleted with them). */
  memberSessions: number;
}

export interface DeletePlayerResult {
  deletedSessions: number;
}

const isOwnedBy = (s: AnySession, id: number) => s.primary_player_id === id;
const involves = (s: AnySession, id: number) => s.players.some((p) => p.id === id);

/** Every stored player with how much data would go away if deleted. */
export async function listPlayerDataSummaries(): Promise<PlayerDataSummary[]> {
  const db = await getDb();
  const [players, hunts, terrors, mds, legacy] = await Promise.all([
    db.getAll('players') as Promise<StoredPlayer[]>,
    db.getAll('hunts') as Promise<StoredHunt[]>,
    db.getAll('terrors') as Promise<StoredTerror[]>,
    db.getAll('mds') as Promise<StoredMd[]>,
    db.getAll('shinyLegacy') as Promise<StoredShinyLegacy[]>,
  ]);

  return players
    .map((p) => {
      const all: AnySession[] = [...hunts, ...terrors, ...mds];
      return {
        id: p.id,
        name: p.name,
        ownedHunts: hunts.filter((s) => isOwnedBy(s, p.id)).length,
        ownedTerrors: terrors.filter((s) => isOwnedBy(s, p.id)).length,
        ownedMds: mds.filter((s) => isOwnedBy(s, p.id)).length,
        ownedShinyLegacy: legacy.filter((r) => r.player_id === p.id).length,
        memberSessions: all.filter((s) => !isOwnedBy(s, p.id) && involves(s, p.id)).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Removes every trace of one player, in a single transaction:
 *  - every session the player is part of (owner or party member) is deleted
 *    entirely, so no total keeps counting their share;
 *  - sessions left with no existing player at all (e.g. already stripped of
 *    their players by an earlier version of this delete) are deleted too;
 *  - their imported roulette history and the player record itself are deleted. */
export async function deletePlayerData(playerId: number): Promise<DeletePlayerResult> {
  const db = await getDb();
  const tx = db.transaction(['players', 'shinyLegacy', ...SESSION_STORES], 'readwrite');
  let deletedSessions = 0;

  const alive = new Set(
    ((await tx.objectStore('players').getAllKeys()) as number[]).filter((id) => id !== playerId)
  );
  const hasLivePlayer = (s: AnySession) =>
    (s.primary_player_id !== null && alive.has(s.primary_player_id)) || s.players.some((p) => alive.has(p.id));

  for (const storeName of SESSION_STORES) {
    const store = tx.objectStore(storeName);
    const sessions = (await store.getAll()) as AnySession[];
    for (const s of sessions) {
      if (isOwnedBy(s, playerId) || involves(s, playerId) || !hasLivePlayer(s)) {
        await store.delete(s.id);
        deletedSessions++;
      }
    }
  }

  // Imported roulette history owned by the player goes with them (it carries
  // their name); it is not counted in deletedSessions, which the UI words as
  // hunts/terrors/MDs.
  const legacyStore = tx.objectStore('shinyLegacy');
  const legacy = (await legacyStore.getAll()) as StoredShinyLegacy[];
  for (const r of legacy) if (r.player_id === playerId) await legacyStore.delete(r.id);

  await tx.objectStore('players').delete(playerId);
  await tx.done;
  return { deletedSessions };
}
