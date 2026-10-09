// Boss banners from the PokeXGames wiki (bd/bosses, copied to
// public/static/bosses by scripts/copy-icons.mjs). Two lookups:
//   - mdBanner(mdName): the round "bolinha" banner of a Mystery Dungeon, for
//     the MD cards. MD records carry the BOSS name (md_name = "Dorabelle",
//     "Mamoswine"...) while the wiki names the DUNGEON ("Dorabelle's Wrath",
//     "Below Zero"), so the match is fuzzy plus an explicit alias table.
//   - terrorBosses(): the 17 Terror/Besta boss banners for the Terror gallery.
// Unknown names resolve to null and callers fall back to the Pokémon sprite.
import bossIndex from '../../../bd/bosses/index.json';

export type BossEnergy = 'azul' | 'vermelha';

export interface MdBanner {
  /** URL of the banner (webp, round art that already includes the dungeon name). */
  src: string;
  /** Wiki dungeon name, e.g. "Dorabelle's Wrath". */
  name: string;
  energy: BossEnergy | null;
}

export interface TerrorBoss {
  name: string;
  src: string;
  width: number;
  height: number;
  /** The three legendary dogs of the Outland rotation. */
  legendaryDog: boolean;
}

interface IndexItem {
  kind: string;
  name: string;
  file: string;
  energy: string | null;
}

// The wiki serves every banner as a ~308x309 image (Giant Shiny Tentacruel is
// 287x304); only used as width/height hints so the layout doesn't jump.
const BANNER_W = 308;
const BANNER_H = 309;

const BASE_URL: string = import.meta.env?.BASE_URL ?? '/';

/** Per-segment encoding: names have spaces and apostrophes. A literal '&' stays as
 * it is (valid in a path): the static servers (Vite, sirv) decode the path with
 * decodeURI, which does not undo %26, so "Seishin %26 Yurei.png" is never found. */
function bannerUrl(file: string): string {
  return `${BASE_URL}static/bosses/${file
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/%26/g, '&'))
    .join('/')}`;
}

/** Lowercase, no accents, apostrophes dropped, other punctuation -> single space. */
export function normalizeBossName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const items = (bossIndex as { items: IndexItem[] }).items;

interface MdEntry {
  name: string;
  key: string;
  /** key without a leading "the " ("the darkness" -> "darkness"). */
  bareKey: string;
  energy: BossEnergy | null;
  file: string;
}

const stripThe = (key: string) => key.replace(/^the /, '');

const mdEntries: MdEntry[] = items
  .filter((i) => i.kind === 'md')
  .map((i) => ({
    name: i.name,
    key: normalizeBossName(i.name),
    bareKey: stripThe(normalizeBossName(i.name)),
    energy: i.energy === 'azul' || i.energy === 'vermelha' ? i.energy : null,
    file: i.file,
  }));

const mdByKey = new Map(mdEntries.map((e) => [e.key, e]));

/**
 * md_name is the boss that was fought, the wiki names the dungeon. Names that
 * the generic rules below cannot derive (key = normalizeBossName(md_name), value = wiki
 * dungeon name):
 *   - Dorabelle        -> "Dorabelle's Wrath"  (also found by the "X's Wrath" rule; kept explicit)
 *   - Overqwil         -> "Alpha Overqwil"     (also found by the "Alpha X" rule; kept explicit)
 *   - Mamoswine        -> "Below Zero"         (the dungeon's boss is a Mamoswine)
 *   - Cyber Porygon-Z  -> "Cyber World"        (the dungeon's boss is Cyber Porygon-Z)
 */
const MD_ALIASES: Record<string, string> = {
  dorabelle: "Dorabelle's Wrath",
  overqwil: 'Alpha Overqwil',
  mamoswine: 'Below Zero',
  'cyber porygon z': 'Cyber World',
};

function entryFor(wikiName: string): MdEntry | null {
  return mdByKey.get(normalizeBossName(wikiName)) ?? null;
}

const toBanner = (e: MdEntry): MdBanner => ({ src: bannerUrl(e.file), name: e.name, energy: e.energy });

/** Whole-word containment ("darkness" in "defeat the darkness"). */
function containsWords(haystack: string, needle: string): boolean {
  return needle !== '' && ` ${haystack} `.includes(` ${needle} `);
}

/** The only element, or null when none/several (an ambiguous name must not guess). */
function unique<T>(list: T[]): T | null {
  return list.length === 1 ? list[0] : null;
}

const cache = new Map<string, MdBanner | null>();

/**
 * Banner of the Mystery Dungeon whose boss/dungeon name is `mdName`.
 * Order: alias table, exact dungeon name, "Alpha X", "X's Wrath", then a
 * unique whole-word containment either way. Ambiguous or unknown -> null.
 */
export function mdBanner(mdName: string | null | undefined): MdBanner | null {
  if (!mdName) return null;
  const key = normalizeBossName(mdName);
  if (!key) return null;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let found: MdEntry | null = null;
  const alias = MD_ALIASES[key];
  if (alias) found = entryFor(alias);
  found ??= mdByKey.get(key) ?? null;
  found ??= mdByKey.get(`alpha ${key}`) ?? null;
  found ??= mdByKey.get(`${key}s wrath`) ?? null;
  if (!found) {
    const bare = stripThe(key);
    // The record's name is a dungeon name without its "The" ("Darkness"), else a
    // unique whole-word fragment of one ("Mewtwo" -> "Mewtwo Strikes Back") ...
    found = unique(mdEntries.filter((e) => e.bareKey === bare));
    found ??= unique(mdEntries.filter((e) => containsWords(e.key, bare)));
    // ... or it embeds a dungeon name ("Alpha Overqwil (Master)"): take the longest unique hit.
    if (!found) {
      const hits = mdEntries.filter((e) => containsWords(key, e.key) || containsWords(key, e.bareKey));
      const longest = Math.max(0, ...hits.map((e) => e.key.length));
      found = unique(hits.filter((e) => e.key.length === longest));
    }
  }
  const result = found ? toBanner(found) : null;
  cache.set(key, result);
  return result;
}

const LEGENDARY_DOGS = new Set(['Entei', 'Raikou', 'Suicune']);

const terror: TerrorBoss[] = items
  .filter((i) => i.kind === 'terror')
  .map((i) => ({
    name: i.name,
    src: bannerUrl(i.file),
    width: i.name === 'Giant Shiny Tentacruel' ? 287 : BANNER_W,
    height: i.name === 'Giant Shiny Tentacruel' ? 304 : BANNER_H,
    legendaryDog: LEGENDARY_DOGS.has(i.name),
  }));

/** The Terror/Besta boss banners, in the wiki order (legendary dogs first). */
export function terrorBosses(): TerrorBoss[] {
  return terror;
}
