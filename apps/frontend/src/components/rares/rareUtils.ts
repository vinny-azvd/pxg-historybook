import { useEffect, useState } from 'react';
import type { RareOrigin, RareSpeciesRow, RaresSummary } from '../../api/types';
import { parsePokemonName } from '../../pokemon';
import { niceScale } from '../charts/chartKit';

export const ORIGIN_LABEL: Record<RareOrigin, string> = { hunt: 'Hunt', md: 'MD' };

// Origin colors shared by every chart on the page that splits by origin
// (timeline, Raros/h per hunt/MD), so blue means "Hunts" wherever it shows up.
// The category bar below draws from the other slots on purpose.
export const ORIGIN_SERIES: Record<RareOrigin, { label: string; color: string }> = {
  hunt: { label: 'Hunts', color: 'var(--series-1)' },
  md: { label: 'MD', color: 'var(--series-2)' },
};

/** One wording for rares the game counted without naming the enemy: the full
 * form on chart rows/notes, the short one where space is tight (keys). */
export const UNIDENTIFIED_LABEL = 'Espécie não identificada';
export const UNIDENTIFIED_SHORT = 'Não identificada';

/** Detail page of the hunt/MD a rare came from. */
export function entryPath(origin: RareOrigin, entryId: number): string {
  return origin === 'md' ? `/md/${entryId}` : `/hunts/${entryId}`;
}

/** Rares in the session totals that no breakdown can show: with a Treinador
 * filter on a party session, `rare_kills` counts the whole party, but only
 * that Treinador's own enemy rows are listed. Kept as its own slice so every
 * view adds up to the same total as the "Raros no período" KPI. */
export function teammateRareKills(summary: RaresSummary): number {
  return Math.max(summary.totalRareKills - summary.identifiedRareKills - summary.unidentifiedRareKills, 0);
}

// Fixed category -> color mapping, so "Golden" keeps its color whether or not
// Shiny is present in the period (color follows the category, not its rank).
// Slots 3-8 only (1-2 are the origins), in an order whose neighbours pass the
// palette validator in light and dark; the two neutral slices close the bar.
export type RareCategory = 'shiny' | 'mega' | 'golden' | 'giant' | 'other' | 'unidentified' | 'teammates';

export const RARE_CATEGORIES: { key: RareCategory; label: string; color: string }[] = [
  { key: 'shiny', label: 'Shiny', color: 'var(--series-7)' },
  { key: 'mega', label: 'Mega', color: 'var(--series-5)' },
  { key: 'golden', label: 'Golden', color: 'var(--series-4)' },
  { key: 'giant', label: 'Giant', color: 'var(--series-3)' },
  { key: 'other', label: 'Outros', color: 'var(--series-8)' },
  { key: 'unidentified', label: UNIDENTIFIED_SHORT, color: 'var(--type-unknown)' },
  // Striped, so it doesn't read as a second "não identificada" grey.
  {
    key: 'teammates',
    label: 'Outros treinadores',
    color: 'repeating-linear-gradient(135deg, var(--type-unknown) 0 3px, var(--surface-1) 3px 6px)',
  },
];

const CATEGORY_VARIANTS = new Set<RareCategory>(['shiny', 'mega', 'golden', 'giant']);

/** Category of one exported rare name: the first of its variant prefixes that
 * has its own slice ("Shiny Mega X" counts as Shiny, the prefix the game
 * shows first); anything else - plain names, Cyber, Alpha... - is "Outros". */
export function rareCategory(enemy: string): 'shiny' | 'mega' | 'golden' | 'giant' | 'other' {
  const variant = parsePokemonName(enemy).variants.find((v) => CATEGORY_VARIANTS.has(v as RareCategory));
  return (variant as 'shiny' | 'mega' | 'golden' | 'giant' | undefined) ?? 'other';
}

export interface CategoryShare {
  key: RareCategory;
  label: string;
  color: string;
  count: number;
  share: number; // 0..1 of all slices - the KPI total, once teammates are in
}

export function categoryShares(species: RareSpeciesRow[], unidentified: number, teammates = 0): CategoryShare[] {
  const counts = new Map<RareCategory, number>();
  for (const row of species) {
    const key = rareCategory(row.enemy);
    counts.set(key, (counts.get(key) ?? 0) + row.count);
  }
  if (unidentified > 0) counts.set('unidentified', unidentified);
  if (teammates > 0) counts.set('teammates', teammates);
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return RARE_CATEGORIES.filter((c) => (counts.get(c.key) ?? 0) > 0).map((c) => ({
    ...c,
    count: counts.get(c.key)!,
    share: total > 0 ? counts.get(c.key)! / total : 0,
  }));
}

/** Narrow screens drop the sprite/badge-heavy axis labels down to what fits
 * next to a usable bar length. */
export function useNarrowScreen(maxWidth = 600): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return narrow;
}

/** Integer ticks for counts: niceScale with as many intervals as the max
 * allows, so a max of 2 reads 0 | 1 | 2 instead of 0 | 0,5 | 1 | 1,5 | 2. */
export function countScale(max: number) {
  return niceScale(max, Math.max(1, Math.min(5, Math.ceil(max))));
}

/** Rough rendered width of 12px system-sans text, for SVG labels that can't
 * be measured before they're drawn. */
export function approxTextWidth(text: string, px = 12): number {
  return text.length * px * 0.58;
}
