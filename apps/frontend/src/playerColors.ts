import { useCallback } from 'react';
import { useFilters } from './FiltersContext';
import { usePreferences } from './PreferencesContext';

const SERIES_SLOTS = 8;

/** A player's color, stable across pages and filters: the default slot comes
 * from the player's position in the FULL players list (by id), not among the
 * players that happen to have data in the current period - otherwise filtering
 * a week where player 1 didn't hunt repainted player 2 in player 1's color.
 * Defaults are the theme's --series-N tokens (so light/dark and themes recolor
 * them); a color the user picked in the legend still wins. */
export function usePlayerColor(): (playerId: number | string) => string {
  const { players } = useFilters();
  const { playerColors } = usePreferences();

  return useCallback(
    (playerId: number | string) => {
      const custom = playerColors[String(playerId)];
      if (custom) return custom;
      const ordered = [...players].sort((a, b) => a.id - b.id);
      const index = ordered.findIndex((p) => String(p.id) === String(playerId));
      // Until the players list loads, fall back to the id itself so the color
      // is still deterministic (ids start at 1).
      const slot = index >= 0 ? index : Math.max(0, Number(playerId) - 1);
      return `var(--series-${(slot % SERIES_SLOTS) + 1})`;
    },
    [players, playerColors]
  );
}

/** Resolves a CSS color (a hex, or a var(--token)) to a #rrggbb string - a
 * native <input type="color"> only accepts hex, not custom properties. */
export function toHexColor(color: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(color.trim());
  const value = match ? getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() : color.trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#888888';
}
