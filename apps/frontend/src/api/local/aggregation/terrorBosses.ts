// Ported from the GET /api/terrors/bosses route: per enemy, in how many
// rotations (exports) damage was dealt to it. With a player filter only that
// player's own damage rows count.
import type { TerrorBossFights } from '../../types';
import type { StoredTerror } from '../storedTypes';
import { buildFilterPredicate, type FilterQuery } from './shared';

export function computeTerrorBossFights(terrors: StoredTerror[], filter: FilterQuery): TerrorBossFights {
  const filtered = terrors.filter(buildFilterPredicate<StoredTerror>(filter));
  const playerId = filter.player ? Number(filter.player) : undefined;
  const byEnemy = new Map<string, { count: number; lastAt: string }>();

  for (const terror of filtered) {
    const damageByEnemy = new Map<string, number>();
    for (const row of terror.damage) {
      if (playerId !== undefined && row.player_id !== playerId) continue;
      damageByEnemy.set(row.enemy, (damageByEnemy.get(row.enemy) ?? 0) + row.damage_dealt);
    }
    for (const [enemy, dealt] of damageByEnemy) {
      if (dealt <= 0) continue;
      const entry = byEnemy.get(enemy) ?? { count: 0, lastAt: terror.start_time };
      entry.count += 1;
      if (terror.start_time > entry.lastAt) entry.lastAt = terror.start_time;
      byEnemy.set(enemy, entry);
    }
  }

  return {
    rotations: filtered.length,
    fights: [...byEnemy.entries()]
      .map(([enemy, { count, lastAt }]) => ({ enemy, count, lastAt }))
      .sort((a, b) => b.count - a.count || a.enemy.localeCompare(b.enemy)),
  };
}
