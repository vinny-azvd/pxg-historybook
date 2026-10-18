// Pokémon name -> species/sprite/type resolution for PXG enemy, hunt and MD
// names ("Shiny Muk", "Mega Charizard X", "Cyber Porygon-Z"...). Everything is
// static: species data comes from the committed src/data/pokedex.json and the
// small sprites are copied into public/static/pokemon at build time
// (scripts/pokemon/), so nothing here calls pokeapi.co.
import { canonicalEnemyName } from './enemyNames';
import pokedexJson from './data/pokedex.json';
import spritesCommit from '../scripts/pokemon/sprites-commit.json';

export type PokemonType =
  | 'normal'
  | 'fighting'
  | 'flying'
  | 'poison'
  | 'ground'
  | 'rock'
  | 'bug'
  | 'ghost'
  | 'steel'
  | 'fire'
  | 'water'
  | 'grass'
  | 'electric'
  | 'psychic'
  | 'ice'
  | 'dragon'
  | 'dark'
  | 'fairy';

/**
 * PXG name prefixes. Only shiny and mega exist in PokeAPI; the others are
 * PXG-only and render as the base species sprite plus a text badge.
 */
export type PokemonVariant =
  | 'shiny'
  | 'mega'
  | 'golden'
  | 'giant'
  | 'nightmare'
  | 'cyber'
  | 'alpha'
  | 'elite'
  | 'terror'
  | 'ancient'
  | 'fight-the-bite';

export type PokemonRegion = 'alola' | 'galar' | 'hisui' | 'paldea';

export interface ParsedPokemonName {
  /** Name without variant/region prefixes or mega suffix, as written ("Porygon-Z"). */
  base: string;
  /** pokedex.json species key ("porygon-z"), null when the name isn't a Pokémon.
   * For special forms it is the form's own key ("bloodmoonursaluna"), NOT the
   * base species, so kills of Ursaluna and of Bloodmoon Ursaluna (or Rotom and
   * Rotom (Frost)) stay separate hunt targets, as they were before the forms
   * were resolvable. */
  species: string | null;
  /** Pokémon id of `species` (for a special form, the form's own id: its sprite). */
  speciesId: number | null;
  variants: PokemonVariant[];
  region: PokemonRegion | null;
  /** PokeAPI pokemon id of the regional form (Alolan Muk = 10113) or of a special form (Bloodmoon Ursaluna = 10272). */
  formId: number | null;
  /** '' for a plain mega, 'x'/'y'/'z' or e.g. 'female' when the species has several. */
  megaSuffix: string | null;
  /** PokeAPI pokemon id of the official mega (not the pokemon-form id). */
  megaId: number | null;
}

interface DexEntry {
  id: number;
  types: string[];
}
interface DexMega {
  id: number;
  name: string;
  suffix: string;
  /** Only present when the mega's types differ from the base species. */
  types?: string[];
}
interface Pokedex {
  species: Record<string, DexEntry>;
  megas: Record<string, DexMega[]>;
  regional: Record<string, DexEntry>;
  /** Forms with their own game name that are neither mega nor regional, keyed by the squashed in-game name. */
  forms: Record<string, DexEntry & { species: string }>;
}

const pokedex: Pokedex = pokedexJson;
// Maps instead of plain-object lookups so an enemy literally named e.g.
// "Constructor" can't hit Object.prototype.
const SPECIES = new Map(Object.entries(pokedex.species));
const MEGAS = new Map(Object.entries(pokedex.megas));
const REGIONAL = new Map(Object.entries(pokedex.regional));
const FORMS = new Map(Object.entries(pokedex.forms));

/**
 * Same slug rules as PokeAPI identifiers: "Mr. Mime" -> "mr-mime",
 * "Farfetch'd" -> "farfetchd", "Nidoran♀" -> "nidoran-f", "Type: Null" ->
 * "type-null", "Flabébé" -> "flabebe".
 */
export function normalizePokemonName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .toLowerCase()
    .replace(/[.'‘’ʼ:]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Fallback index for spelling differences the slug rules can't see: the
// roulette writes "Mr.Mime" (no space) which slugs to "mrmime", while PokeAPI
// has "mr-mime". Both sides are squashed to letters+digits. If two species ever
// squash to the same string the entry is dropped (null), so a collision can't
// pick a wrong species; an exact slug always wins (see speciesKey).
const SQUASHED = new Map<string, string | null>();
for (const key of SPECIES.keys()) {
  const squashed = key.replace(/[^a-z0-9]/g, '');
  SQUASHED.set(squashed, SQUASHED.has(squashed) ? null : key);
}

/** pokedex.json "forms" key for a normalized name ("rotom-frost" -> "rotomfrost"), or null. */
function formKey(key: string): string | null {
  const squashed = key.replace(/[^a-z0-9]/g, '');
  return FORMS.has(squashed) ? squashed : null;
}

/** Canonical pokedex.json species key for a normalized name, or null. */
function speciesKey(key: string): string | null {
  if (SPECIES.has(key)) return key;
  return SQUASHED.get(key.replace(/[^a-z0-9]/g, '')) ?? null;
}

// Explicit list on purpose: guessing that any unknown leading word is a
// prefix would turn e.g. "Darkrai Minion" or "Nightmare Terror Root" into
// real species.
const VARIANT_PREFIXES: Record<string, PokemonVariant> = {
  shiny: 'shiny',
  mega: 'mega',
  golden: 'golden',
  giant: 'giant',
  nightmare: 'nightmare',
  cyber: 'cyber',
  alpha: 'alpha',
  elite: 'elite',
  terror: 'terror',
  ancient: 'ancient',
  'fight-the-bite': 'fight-the-bite',
};
const REGION_PREFIXES: Record<string, PokemonRegion> = {
  alolan: 'alola',
  galarian: 'galar',
  hisuian: 'hisui',
  paldean: 'paldea',
};

const parseCache = new Map<string, ParsedPokemonName>();

export function parsePokemonName(rawName: string): ParsedPokemonName {
  const cached = parseCache.get(rawName);
  if (cached) return cached;
  // Golden Sudowoodo / Golden Steelix are really the shiny.
  const name = canonicalEnemyName(rawName);

  // A trailing "[NC]" (Nightmare Crystal) is an annotation, not part of the
  // name; the NC badge comes from the from_nightmare_crystal flag instead.
  const cleaned = name.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const variants: PokemonVariant[] = [];
  let region: PokemonRegion | null = null;

  // Strip prefixes in any order ("Shiny Mega Venusaur"), but never the last
  // word, and stop as soon as what's left is already a species.
  while (
    words.length > 1 &&
    !speciesKey(normalizePokemonName(words.join(' '))) &&
    !formKey(normalizePokemonName(words.join(' ')))
  ) {
    const word = normalizePokemonName(words[0]);
    if (Object.hasOwn(VARIANT_PREFIXES, word)) {
      const variant = VARIANT_PREFIXES[word];
      if (!variants.includes(variant)) variants.push(variant);
    } else if (Object.hasOwn(REGION_PREFIXES, word)) {
      region = REGION_PREFIXES[word];
    } else {
      break;
    }
    words.shift();
  }

  let base = words.join(' ');
  const form = formKey(normalizePokemonName(base));
  if (form) {
    // "Bloodmoon Ursaluna", "Rotom (Frost)": a form with its own sprite and
    // types. Mega/regional prefixes on top of it don't exist, so they're ignored.
    const entry = FORMS.get(form)!;
    const formResult: ParsedPokemonName = {
      base,
      species: form,
      speciesId: entry.id,
      variants,
      region: null,
      formId: entry.id,
      megaSuffix: null,
      megaId: null,
    };
    parseCache.set(rawName, formResult);
    return formResult;
  }
  let key = speciesKey(normalizePokemonName(base)) ?? normalizePokemonName(base);
  let megaSuffix: string | null = null;
  let megaId: number | null = null;

  if (variants.includes('mega')) {
    // "Mega Charizard X" -> charizard + "x". The full name is tried first
    // (above), so "Mega Porygon-Z" stays porygon-z instead of porygon + "z".
    let requested: string | null = null;
    if (!SPECIES.has(key)) {
      const match = key.match(/^(.+)-([a-z0-9]+)$/);
      const matched = match ? speciesKey(match[1]) : null;
      if (match && matched) {
        key = matched;
        requested = match[2];
        base = base.replace(new RegExp(`[\\s-]+${requested}$`, 'i'), '');
      }
    }
    const megas = MEGAS.get(key) ?? [];
    // Unknown or missing suffix: the plain mega, else the first one listed
    // (Mega Charizard -> X, Mega Meowstic -> male), so a sprite still shows.
    const mega =
      megas.find((m) => m.suffix === requested) ?? megas.find((m) => m.suffix === '') ?? megas[0] ?? null;
    if (mega) {
      megaSuffix = mega.suffix;
      megaId = mega.id;
    }
  }

  const entry = SPECIES.get(key);
  // Not a Pokémon ("Nightmare Crystal", "Darkrai Minion"): keep the whole
  // name and no badges, so "Nightmare" isn't presented as a variant of
  // something that has no species.
  const result: ParsedPokemonName = {
    base: entry ? base : cleaned,
    species: entry ? key : null,
    speciesId: entry?.id ?? null,
    variants: entry ? variants : [],
    region: entry ? region : null,
    formId: entry && region ? (REGIONAL.get(`${key}-${region}`)?.id ?? null) : null,
    megaSuffix: entry ? megaSuffix : null,
    megaId: entry ? megaId : null,
  };
  parseCache.set(rawName, result);
  return result;
}

/** PokeAPI pokemon id whose sprite represents this name (mega/regional form first). */
function spriteId(parsed: ParsedPokemonName): number | null {
  return parsed.megaId ?? parsed.formId ?? parsed.speciesId;
}

export interface SpriteOptions {
  /** Overrides the "Shiny" prefix (e.g. to show a plain sprite). */
  shiny?: boolean;
  /** Back sprite (battle scene). Always normal colouring: back shinies aren't downloaded. */
  back?: boolean;
}

/**
 * Local 96px sprite URL (copied at build time by fetch-sprites.mjs), or null
 * when the name isn't a Pokémon. Shiny/mega use the official PokeAPI sprites;
 * Golden/Giant/Nightmare/Cyber/... don't exist there, so they get the base
 * species sprite and the caller shows variantBadges(). Pair with
 * `onError -> pokeballFallback()` for builds made without network.
 */
export function pokemonSprite(name: string, opts: SpriteOptions = {}): string | null {
  const parsed = parsePokemonName(name);
  const id = spriteId(parsed);
  if (id === null) return null;
  const shiny = opts.shiny ?? parsed.variants.includes('shiny');
  const folder = opts.back ? 'back' : shiny ? 'shiny' : 'normal';
  return `${import.meta.env.BASE_URL}static/pokemon/${folder}/${id}.png`;
}

const ART_BASE = `https://raw.githubusercontent.com/PokeAPI/sprites/${spritesCommit.commit}/sprites/pokemon/other`;

/**
 * Large art (512px, ~100-200 KB each) for the Cards theme, loaded at runtime
 * from GitHub pinned to the same commit as the build sprites. Returns the
 * URLs in fallback order (try the next on `onError`), empty when unknown.
 * Pokémon HOME renders come first because they are the only official shiny
 * art; PokeAPI's official-artwork/shiny folder is fan-made, so a shiny falls
 * back to the normal official art (the badge still says "Shiny").
 */
export function pokemonArt(name: string, opts: { shiny?: boolean } = {}): string[] {
  const parsed = parsePokemonName(name);
  const id = spriteId(parsed);
  if (id === null) return [];
  const shiny = opts.shiny ?? parsed.variants.includes('shiny');
  const urls = [`${ART_BASE}/home/${id}.png`, `${ART_BASE}/official-artwork/${id}.png`];
  return shiny ? [`${ART_BASE}/home/shiny/${id}.png`, ...urls] : urls;
}

const POKEBALL_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
  "<circle cx='16' cy='16' r='14' fill='#f4f4f2' stroke='#2b2b2b' stroke-width='2'/>" +
  "<path d='M2 16a14 14 0 0 1 28 0z' fill='#d93b2b' stroke='#2b2b2b' stroke-width='2'/>" +
  "<circle cx='16' cy='16' r='4.5' fill='#f4f4f2' stroke='#2b2b2b' stroke-width='2'/>" +
  '</svg>';
const POKEBALL_URI = `data:image/svg+xml,${encodeURIComponent(POKEBALL_SVG)}`;

/** Inline Pokéball placeholder for unknown names or sprites that failed to load. */
export function pokeballFallback(): string {
  return POKEBALL_URI;
}

/** English type ids (PokeAPI identifiers), mega/regional types when they differ. */
export function pokemonTypes(name: string): PokemonType[] {
  const parsed = parsePokemonName(name);
  if (!parsed.species) return [];
  const mega = parsed.megaId !== null ? MEGAS.get(parsed.species)?.find((m) => m.id === parsed.megaId) : undefined;
  const regional = parsed.region ? REGIONAL.get(`${parsed.species}-${parsed.region}`) : undefined;
  const types = mega?.types ?? regional?.types ?? FORMS.get(parsed.species)?.types ?? SPECIES.get(parsed.species)?.types ?? [];
  return types as PokemonType[];
}

// PXG's own names, kept as the game shows them (players search for "Golden
// Sudowoodo", not "Sudowoodo Dourado").
const VARIANT_LABELS: Record<PokemonVariant, string> = {
  shiny: 'Shiny',
  mega: 'Mega',
  golden: 'Golden',
  giant: 'Giant',
  nightmare: 'Nightmare',
  cyber: 'Cyber',
  alpha: 'Alpha',
  elite: 'Elite',
  terror: 'Terror',
  ancient: 'Ancient',
  'fight-the-bite': 'Fight-the-Bite',
};

/** Badge labels for the name's variants, in the order they appear in the name. */
export function variantBadges(name: string): string[] {
  return parsePokemonName(name).variants.map((v) => VARIANT_LABELS[v]);
}

const TYPE_LABELS: Record<PokemonType, string> = {
  normal: 'Normal',
  fighting: 'Lutador',
  flying: 'Voador',
  poison: 'Venenoso',
  ground: 'Terrestre',
  rock: 'Pedra',
  bug: 'Inseto',
  ghost: 'Fantasma',
  steel: 'Aço',
  fire: 'Fogo',
  water: 'Água',
  grass: 'Planta',
  electric: 'Elétrico',
  psychic: 'Psíquico',
  ice: 'Gelo',
  dragon: 'Dragão',
  dark: 'Sombrio',
  fairy: 'Fada',
};

/** The 18 battle types, in the order of TYPE_LABELS (for filters and legends). */
export const POKEMON_TYPES = Object.keys(TYPE_LABELS) as PokemonType[];

// hasOwn rather than `in`, so "constructor" doesn't count as a type.
export function isPokemonType(type: string | null | undefined): type is PokemonType {
  return typeof type === 'string' && Object.hasOwn(TYPE_LABELS, type);
}

/** Portuguese type name; "Desconhecido" for anything outside the 18 battle types. */
export function typeLabel(type: string | null | undefined): string {
  return isPokemonType(type) ? TYPE_LABELS[type] : 'Desconhecido';
}

/**
 * CSS colour for a type, from the contrast-checked tokens in
 * themes/types.css (neutral grey when unknown).
 */
export function typeColor(type: string | null | undefined): string {
  return isPokemonType(type) ? `var(--type-${type})` : 'var(--type-unknown)';
}
