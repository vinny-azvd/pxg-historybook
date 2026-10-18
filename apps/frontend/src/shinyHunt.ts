// Reads a hunt export as a "shiny hunt": which shinies/megas dropped, which one
// the session was aiming at, and which others came along in the shared hunt.
// Rules (agreed with the roulette project):
//  - a find is a rare row that is Shiny or Mega ("Shiny Mega X" counts as Shiny,
//    Golden Sudowoodo/Steelix are Shiny - see enemyNames.ts) or any other
//    Pokémon of the roulette catalog (Mamoswine, Porygon-Z...); Giant, other
//    Goldens, Cyber... are not shiny finds;
//  - Shiny X and Mega X of one species spawn together, so they are grouped by
//    species and the one that isn't the target is its companion.
import { canonicalEnemyName } from './enemyNames';
import { parsePokemonName } from './pokemon';
import { inCatalog, squashName, tierOf, type ShinyTier } from './shinyTiers';

export interface EnemyRow {
  enemy: string;
  count: number;
  rare: boolean | number;
}

export interface ShinyFind {
  /** Canonical name ("Shiny Gengar"). */
  name: string;
  /** PokeAPI-style species key ("gengar"), null when unknown. */
  species: string | null;
  count: number;
  tier: ShinyTier | null;
  removed: boolean;
  isTarget: boolean;
  /** Shiny/Mega counterpart of the target species. */
  isTargetCompanion: boolean;
}

export interface TargetCandidate {
  species: string;
  /** Display name without prefixes ("Gengar"), for the target picker. */
  label: string;
  /** Normal (non-shiny) kills of the species: what the session was farming. */
  normalKills: number;
  shinies: number;
}

export interface ShinyHuntDetection {
  /** Target species (the override, else the suggestion); null when there is none. */
  targetSpecies: string | null;
  /** Every species of the hunt a target can be picked from: those with shinies
   * first (most normal kills first), then the ones with kills only - a hunt
   * with 0 shinies still counts for the averages. */
  candidates: TargetCandidate[];
  finds: ShinyFind[];
  /** Kills per species key: normal kills plus its shiny/mega finds. The base
   * of "kills por shiny", so a shared hunt isn't charged to every find. */
  killsBySpecies: Record<string, number>;
}

function isShinyFind(row: EnemyRow): boolean {
  if (!row.rare) return false;
  if (inCatalog(tierOf(row.enemy))) return true;
  const { species, variants } = parsePokemonName(row.enemy);
  return species !== null && (variants.includes('shiny') || variants.includes('mega'));
}

// Leading words PXG puts before a name. Only used for forms PokeAPI has no
// species for (Rotom (Frost)): parsePokemonName strips them for real species.
const VARIANT_WORDS = new Set(['shiny', 'mega', 'golden', 'giant', 'nightmare', 'cyber', 'alpha', 'elite', 'terror', 'ancient']);

/** Species key, display label and whether the name is a Shiny/Mega. Forms
 * PokeAPI has no species for fall back to the squashed name WITHOUT its variant
 * words, so "Rotom (Frost)" and "Shiny Rotom (Frost)" share one key and their
 * kills add up. */
export function identity(rawName: string): { key: string; label: string; species: string | null; shinyOrMega: boolean } {
  const name = canonicalEnemyName(rawName.trim());
  const parsed = parsePokemonName(name);
  if (parsed.species) {
    return {
      key: parsed.species,
      label: parsed.base,
      species: parsed.species,
      shinyOrMega: parsed.variants.includes('shiny') || parsed.variants.includes('mega'),
    };
  }
  const words = name.split(/\s+/).filter(Boolean);
  let shinyOrMega = false;
  while (words.length > 1 && VARIANT_WORDS.has(words[0].toLowerCase())) {
    const word = words.shift()!.toLowerCase();
    if (word === 'shiny' || word === 'mega') shinyOrMega = true;
  }
  return { key: squashName(words.join(' ')), label: words.join(' '), species: null, shinyOrMega };
}

function describe(rows: EnemyRow[]) {
  const finds = new Map<string, { species: string; count: number }>();
  const normalKills = new Map<string, number>();
  const labels = new Map<string, string>();
  const normalRows: { id: ReturnType<typeof identity>; count: number }[] = [];
  for (const row of rows) {
    const name = canonicalEnemyName(row.enemy.trim());
    const id = identity(name);
    if (isShinyFind(row)) {
      const prev = finds.get(name);
      finds.set(name, { species: id.key, count: (prev?.count ?? 0) + row.count });
      if (!labels.has(id.key)) labels.set(id.key, id.label);
    } else if (!id.shinyOrMega) {
      normalRows.push({ id, count: row.count });
    }
  }
  // Rows without a PokeAPI species ("Nightmare Crystal", "Darkrai Minion") only
  // count when a find shares their key, so they don't clutter the target picker.
  const findKeys = new Set([...finds.values()].map((f) => f.species));
  for (const { id, count } of normalRows) {
    if (!id.species && !findKeys.has(id.key)) continue;
    normalKills.set(id.key, (normalKills.get(id.key) ?? 0) + count);
    if (!labels.has(id.key)) labels.set(id.key, id.label);
  }
  return { finds, normalKills, labels };
}

function candidatesOf(
  finds: Map<string, { species: string; count: number }>,
  normalKills: Map<string, number>,
  labels: Map<string, string>
) {
  const shiniesBySpecies = new Map<string, number>();
  for (const { species, count } of finds.values()) {
    shiniesBySpecies.set(species, (shiniesBySpecies.get(species) ?? 0) + count);
  }
  const species = new Set([...shiniesBySpecies.keys(), ...normalKills.keys()]);
  const candidates: TargetCandidate[] = [...species].map((key) => ({
    species: key,
    label: labels.get(key) ?? key,
    shinies: shiniesBySpecies.get(key) ?? 0,
    normalKills: normalKills.get(key) ?? 0,
  }));
  // The species being farmed has the most normal kills; shinies only break
  // ties (a shared hunt can drop the same number of each, e.g. Gengar/Haunter).
  return candidates.sort(
    (a, b) =>
      Number(b.shinies > 0) - Number(a.shinies > 0) ||
      b.normalKills - a.normalKills ||
      b.shinies - a.shinies ||
      a.label.localeCompare(b.label)
  );
}

/** `targetSpecies` overrides the suggestion (user pick in the confirm modal);
 * the suggestion only exists when the hunt has at least one shiny find. */
export function detectShinyHunt(rows: EnemyRow[], targetSpecies?: string | null): ShinyHuntDetection {
  const { finds, normalKills, labels } = describe(rows);
  const candidates = candidatesOf(finds, normalKills, labels);
  const suggested = candidates[0]?.shinies ? candidates[0].species : null;
  const target = targetSpecies === undefined ? suggested : targetSpecies;

  // No prototype: a stored target like "constructor" must read as 0 kills.
  const killsBySpecies: Record<string, number> = Object.create(null);
  for (const [species, kills] of normalKills) killsBySpecies[species] = kills;
  for (const { species, count } of finds.values()) killsBySpecies[species] = (killsBySpecies[species] ?? 0) + count;

  const speciesFindCount = new Map<string, number>();
  for (const { species } of finds.values()) speciesFindCount.set(species, (speciesFindCount.get(species) ?? 0) + 1);

  const list: ShinyFind[] = [...finds].map(([name, { species, count }]) => {
    const info = tierOf(name);
    const isShiny = parsePokemonName(name).variants.includes('shiny');
    // Of Shiny X / Mega X the Shiny is the target and the Mega its companion
    // (the Mega is the target only when it is the sole find of the species).
    const isTarget = species === target && (isShiny || speciesFindCount.get(species) === 1);
    return {
      name,
      species,
      count,
      tier: info.tier,
      removed: info.removed,
      isTarget,
      isTargetCompanion: species === target && !isTarget,
    };
  });
  list.sort((a, b) => Number(b.isTarget) - Number(a.isTarget) || b.count - a.count || a.name.localeCompare(b.name));
  return { targetSpecies: target, candidates, finds: list, killsBySpecies };
}
