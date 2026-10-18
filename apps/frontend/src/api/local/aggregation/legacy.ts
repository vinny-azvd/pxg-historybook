// Records of the old roulette's history (StoredShinyLegacy) seen by the
// aggregations. Shared by the Shinies stats and Raros so both apply the same
// filters and read a record the same way.
import type { Filters } from '../../types';
import type { StoredEnemyDefeatedRow, StoredShinyLegacy } from '../storedTypes';
import { canonicalEnemyName } from '../../../enemyNames';
import { identity } from '../../../shinyHunt';
import { dateOnly } from './shared';

/** Legacy records have no party and no players list: they count as the owner's
 * own sessions, so only the owner's filter (or none) keeps them; they are
 * solo sessions for the session-type filter. */
export function filterLegacy(legacy: StoredShinyLegacy[], filter: Filters): StoredShinyLegacy[] {
  const playerId = filter.player ? Number(filter.player) : undefined;
  const fromDate = filter.from ? dateOnly(filter.from) : undefined;
  const toDate = filter.to ? dateOnly(filter.to) : undefined;
  return legacy.filter((r) => {
    // A record the store should never hold (damaged data): skip, never throw.
    if (typeof r.pokemon !== 'string' || typeof r.start_time !== 'string') return false;
    if (playerId !== undefined && r.player_id !== playerId) return false;
    if (fromDate !== undefined && dateOnly(r.start_time) < fromDate) return false;
    if (toDate !== undefined && dateOnly(r.start_time) > toDate) return false;
    if (filter.sessionType && filter.sessionType !== 'player') return false;
    return true;
  });
}

/** The roulette typed "Mr.Mime"; the game exports "Mr. Mime". Same Pokémon, so
 * the history is spelled the game's way and both land in one Raros row. */
export function gameSpelling(name: string): string {
  return canonicalEnemyName(name.trim()).replace(/Mr\.\s*Mime/i, 'Mr. Mime');
}

/** Name the record groups under in "Raros/h por hunt" (what a real hunt's name
 * would be: the species, without Shiny/Mega). */
export function legacyHuntName(record: StoredShinyLegacy): string {
  return identity(gameSpelling(record.pokemon)).label;
}

/** The record's shinies as the rare rows a real export would have: the target
 * and, when it has shinies, the companion. */
export function legacyRareRows(record: StoredShinyLegacy): StoredEnemyDefeatedRow[] {
  const rows: StoredEnemyDefeatedRow[] = [];
  const add = (enemy: string, count: number) => {
    if (count <= 0) return;
    rows.push({
      id: rows.length + 1,
      player_id: record.player_id,
      player_name: record.player_name,
      enemy: gameSpelling(enemy),
      count,
      rare: 1,
      ignored: null,
    });
  };
  add(record.pokemon, record.shinies);
  if (record.companion) add(record.companion, record.companion_shinies);
  return rows;
}
