import { getDb } from './db';
import type { StoredHunt, StoredMd, StoredPlayer, StoredTerror } from './storedTypes';

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
  /** Other people's sessions where this player only appears as a party member. */
  memberSessions: number;
}

export interface DeletePlayerResult {
  deletedSessions: number;
  scrubbedSessions: number;
}

const isOwnedBy = (s: AnySession, id: number) => s.primary_player_id === id;
const involves = (s: AnySession, id: number) => s.players.some((p) => p.id === id);

/** Every stored player with how much data would go away if deleted. */
export async function listPlayerDataSummaries(): Promise<PlayerDataSummary[]> {
  const db = await getDb();
  const [players, hunts, terrors, mds] = await Promise.all([
    db.getAll('players') as Promise<StoredPlayer[]>,
    db.getAll('hunts') as Promise<StoredHunt[]>,
    db.getAll('terrors') as Promise<StoredTerror[]>,
    db.getAll('mds') as Promise<StoredMd[]>,
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
        memberSessions: all.filter((s) => !isOwnedBy(s, p.id) && involves(s, p.id)).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Removes every trace of one player, in a single transaction:
 *  - sessions owned by the player (primary_player_id) are deleted entirely;
 *  - sessions that only list the player as a party member keep the other
 *    people's rows, but the player's own rows and name are stripped out and
 *    the raw payload (which still carries the name) is dropped;
 *  - the player record itself is deleted.
 * Session totals (kills, profit, ...) of scrubbed sessions are not recomputed. */
export async function deletePlayerData(playerId: number): Promise<DeletePlayerResult> {
  const db = await getDb();
  const tx = db.transaction(['players', ...SESSION_STORES], 'readwrite');
  let deletedSessions = 0;
  let scrubbedSessions = 0;

  for (const storeName of SESSION_STORES) {
    const store = tx.objectStore(storeName);
    const sessions = (await store.getAll()) as AnySession[];
    for (const s of sessions) {
      if (isOwnedBy(s, playerId)) {
        await store.delete(s.id);
        deletedSessions++;
      } else if (involves(s, playerId)) {
        const keep = <T extends { player_id: number | null }>(rows: T[]) =>
          rows.filter((r) => r.player_id !== playerId);
        await store.put({
          ...s,
          players: s.players.filter((p) => p.id !== playerId),
          damage: keep(s.damage),
          supplies: keep(s.supplies),
          drops: keep(s.drops),
          experience_entries: keep(s.experience_entries),
          enemies_defeated: keep(s.enemies_defeated as { player_id: number | null }[]),
          raw_json: 'null',
        });
        scrubbedSessions++;
      }
    }
  }

  await tx.objectStore('players').delete(playerId);
  await tx.done;
  return { deletedSessions, scrubbedSessions };
}
