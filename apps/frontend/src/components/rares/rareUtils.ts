import { useEffect, useState } from 'react';
import type { RareEntryRow, RareEvent, RareOrigin, RareSpeciesRow, RaresSummary } from '../../api/types';
import { parsePokemonName, pokemonTypes, type PokemonType } from '../../pokemon';
import { tierOf, type ShinyTier } from '../../shinyTiers';
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

const SPECIES_CHART_TIERS = new Set(['1A', '1B', '1C', '1H']);

/** "Raros por espécie" shows Shinies of the Tier 1 roulette tiers (1A/1B/1C/1H)
 * and any Mega; Shinies of Tier 2, Tier 3 or outside the roulette are left
 * out (they live in the Shinies tab and the full table). Every other rare -
 * Giant, Golden, Cyber... - stays. */
export function showInSpeciesChart(enemy: string): boolean {
  const { variants } = parsePokemonName(enemy);
  if (variants.includes('mega') || !variants.includes('shiny')) return true;
  const tier = tierOf(enemy).tier;
  return tier !== null && SPECIES_CHART_TIERS.has(tier);
}

/** Element filter: with nothing selected everything passes; otherwise a rare
 * passes when ANY of its types is selected. Names the Pokédex has no types for
 * (unknown forms) can't be classified, so they never pass an active filter. */
export function matchesTypes(enemy: string, selected: ReadonlySet<PokemonType>): boolean {
  if (selected.size === 0) return true;
  return pokemonTypes(enemy).some((t) => selected.has(t));
}

/** Type a rare is drawn with: the first of its types, except under an element
 * filter, where it is the first SELECTED one - so a Ghost/Poison Gengar seen
 * through "Venenoso" wears the Poison colour the legend and chips name. */
export function displayType(enemy: string, selected: ReadonlySet<PokemonType>): PokemonType | null {
  const types = pokemonTypes(enemy);
  return types.find((t) => selected.has(t)) ?? types[0] ?? null;
}

/** Raros/h per hunt row once only the rares the page shows are counted. */
export interface VisibleEntryRows {
  rows: RareEntryRow[];
  /** Hunts left out because none of their visible rares remain. */
  hiddenHunts: number;
}

/** Re-counts each hunt NAME from its visible rare events instead of the session
 * `rare_kills` (which also counts Tier 2/3 shinies and unidentified rares that
 * are only a hunt's complement). Sessions and duration are the group's own. */
export function visibleEntryRows(
  entries: RareEntryRow[],
  events: RareEvent[],
  visible: (enemy: string) => boolean
): VisibleEntryRows {
  const kills = new Map<string, number>();
  for (const e of events) {
    if (e.origin !== 'hunt' || !visible(e.enemy)) continue;
    const name = e.entryName ?? 'Sem nome';
    kills.set(name, (kills.get(name) ?? 0) + e.count);
  }
  const rows: RareEntryRow[] = [];
  let hiddenHunts = 0;
  for (const entry of entries) {
    if (entry.origin !== 'hunt') continue;
    const rareKills = kills.get(entry.name) ?? 0;
    if (rareKills === 0) {
      hiddenHunts += 1;
      continue;
    }
    rows.push({
      ...entry,
      rareKills,
      rareKillsPerHour: entry.durationSeconds > 0 ? (rareKills * 3600) / entry.durationSeconds : null,
    });
  }
  // Best rate first, no-time rows last (the chart re-sorts small samples after).
  rows.sort((a, b) => {
    if (a.rareKillsPerHour === b.rareKillsPerHour) return b.rareKills - a.rareKills || a.name.localeCompare(b.name, 'pt-BR');
    if (a.rareKillsPerHour === null) return 1;
    if (b.rareKillsPerHour === null) return -1;
    return b.rareKillsPerHour - a.rareKillsPerHour;
  });
  return { rows, hiddenHunts };
}

/** What the Raros tier filter selects: a roulette tier, or 'out' for a Shiny/Mega
 * the roulette doesn't have. */
export type RareTierKey = ShinyTier | 'out';

/** Tier a rare falls under for the tier filter. Only Shiny and Mega belong to
 * the roulette's catalog; Giant, Golden, Cyber... have no tier (null) and drop
 * out whenever a tier is selected. */
export function rareTierKey(enemy: string): RareTierKey | null {
  const { variants } = parsePokemonName(enemy);
  if (!variants.includes('shiny') && !variants.includes('mega')) return null;
  return tierOf(enemy).tier ?? 'out';
}
