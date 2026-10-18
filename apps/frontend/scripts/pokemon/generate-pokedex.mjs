// Generates apps/frontend/src/data/pokedex.json from the official PokeAPI CSV
// dumps. Run manually (`npm run pokedex -w apps/frontend`) when a new game adds
// species/megas, review the diff and commit the JSON: the app never calls
// pokeapi.co at runtime (their fair-use policy asks consumers to cache
// locally), and the build must not depend on this download succeeding.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '../..');
const outFile = path.join(frontendRoot, 'src', 'data', 'pokedex.json');

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';

// Only the 18 battle types. PokeAPI's types.csv also lists stellar/unknown/
// shadow, which no species has as a regular type.
const BATTLE_TYPES = new Set([
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy',
]);

// Regional forms change both the sprite and the types (Alolan Muk is
// poison/dark), and PXG does spawn them, so they get their own small table.
const REGIONS = ['alola', 'galar', 'hisui', 'paldea'];

// Forms the game lists under their own name that none of the rules above pick
// up: Bloodmoon Ursaluna is a full pokemon (#10272, ground/normal, its own
// sprites) but not a mega nor a regional form, and Rotom's appliance forms are
// spelled "Rotom (Frost)" in game. An explicit table on purpose (a guessed
// "any non-default form" rule would also catch cosmetic ones such as
// pikachu-cosplay). `pokemon` is the PokeAPI pokemon identifier, checked against
// the CSV below, and `name` the in-game spelling the app's key derives from.
// Unown "Legion" is not here: it is a PXG event name, PokeAPI has no such form.
const SPECIAL_FORMS = [
  { pokemon: 'ursaluna-bloodmoon', name: 'Bloodmoon Ursaluna' },
  { pokemon: 'rotom-frost', name: 'Rotom (Frost)' },
  { pokemon: 'rotom-mow', name: 'Rotom (Mow)' },
];

// Same squashing as squashName in src/shinyTiers.ts (letters and digits only),
// so the key is also what shinyHunt.ts already used for these names.
const squash = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

async function loadCsv(name) {
  const res = await fetch(`${CSV_BASE}${name}.csv`);
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`);
  const lines = (await res.text()).trim().split(/\r?\n/);
  // These dumps never quote fields (identifiers are slugs, the rest numbers),
  // so a plain split is enough; columns are looked up by header name so a new
  // column upstream doesn't silently shift the data.
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    if (cells.length !== header.length) throw new Error(`${name}.csv: unexpected row "${line}"`);
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

const [pokemonRows, pokemonTypeRows, typeRows, speciesRows, formRows] = await Promise.all(
  ['pokemon', 'pokemon_types', 'types', 'pokemon_species', 'pokemon_forms'].map(loadCsv),
);

const typeById = new Map(typeRows.map((t) => [t.id, t.identifier]));

const typesByPokemon = new Map();
for (const row of [...pokemonTypeRows].sort((a, b) => Number(a.slot) - Number(b.slot))) {
  const type = typeById.get(row.type_id);
  if (!BATTLE_TYPES.has(type)) continue;
  if (!typesByPokemon.has(row.pokemon_id)) typesByPokemon.set(row.pokemon_id, []);
  typesByPokemon.get(row.pokemon_id).push(type);
}

const pokemonById = new Map(pokemonRows.map((p) => [p.id, p]));
const speciesIdentifierById = new Map(speciesRows.map((s) => [s.id, s.identifier]));

// Keyed by the SPECIES identifier, not the default pokemon's: e.g. species
// "lycanroc" is #745 but its default pokemon is called "lycanroc-midday".
// Species ids double as the default pokemon's id (and sprite file name).
const species = {};
for (const s of [...speciesRows].sort((a, b) => Number(a.id) - Number(b.id))) {
  const def = pokemonRows.find((p) => p.species_id === s.id && p.is_default === '1');
  if (!def) throw new Error(`species ${s.identifier} has no default pokemon`);
  species[s.identifier] = { id: Number(def.id), types: typesByPokemon.get(def.id) ?? [] };
}

const sameTypes = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

// is_mega lives on pokemon_forms, and form ids are NOT pokemon ids (form
// #10515 is pokemon #10290 eelektross-mega; form #10290 is spewpa-polar).
// Sprites are named after pokemon ids, so only pokemon_id is kept.
const megas = {};
for (const form of formRows) {
  if (form.is_mega !== '1') continue;
  const pkm = pokemonById.get(form.pokemon_id);
  const speciesName = speciesIdentifierById.get(pkm.species_id);
  // "charizard-mega-x" -> "x", "venusaur-mega" -> "", "meowstic-male-mega" ->
  // "male", "magearna-original-mega" -> "original": whatever distinguishes
  // this mega from its siblings, so "Mega Charizard X" can pick it.
  const suffix = pkm.identifier
    .slice(speciesName.length + 1)
    .split('-')
    .filter((part) => part !== 'mega')
    .join('-');
  const entry = { id: Number(pkm.id), name: pkm.identifier, suffix };
  // Types only when they differ from the base species (Mega Ampharos gains
  // dragon), to keep the file small.
  const megaTypes = typesByPokemon.get(pkm.id) ?? [];
  if (!sameTypes(megaTypes, species[speciesName].types)) entry.types = megaTypes;
  (megas[speciesName] ??= []).push(entry);
}
for (const list of Object.values(megas)) list.sort((a, b) => a.id - b.id);

const regional = {};
for (const pkm of [...pokemonRows].sort((a, b) => Number(a.id) - Number(b.id))) {
  if (pkm.is_default === '1') continue;
  const speciesName = speciesIdentifierById.get(pkm.species_id);
  const rest = pkm.identifier.slice(speciesName.length + 1);
  const match = rest.match(new RegExp(`^(${REGIONS.join('|')})(?:-(.+))?$`));
  // pikachu-alola-cap is a cosmetic cap, not a regional form; for forms with
  // several regional variants (paldean tauros breeds, galarian darmanitan
  // modes) the first, lowest id is the canonical one.
  if (!match || match[2] === 'cap') continue;
  const key = `${speciesName}-${match[1]}`;
  if (regional[key]) continue;
  regional[key] = { id: Number(pkm.id), types: typesByPokemon.get(pkm.id) ?? [] };
}

const forms = {};
for (const { pokemon, name } of SPECIAL_FORMS) {
  const pkm = pokemonRows.find((p) => p.identifier === pokemon);
  if (!pkm) throw new Error(`special form ${pokemon} not found in pokemon.csv`);
  const speciesName = speciesIdentifierById.get(pkm.species_id);
  const types = typesByPokemon.get(pkm.id) ?? [];
  if (!species[speciesName] || types.length === 0) throw new Error(`special form ${pokemon}: unknown species or types`);
  forms[squash(name)] = { species: speciesName, id: Number(pkm.id), types };
}

// One entry per line: readable diffs when regenerated, and Vite strips the
// whitespace when bundling the JSON anyway.
function writeSection(name, obj, last) {
  const entries = Object.entries(obj).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `  ${JSON.stringify(name)}: {\n${entries.join(',\n')}\n  }${last ? '' : ','}\n`;
}
const json = `{\n${writeSection('species', species)}${writeSection('megas', megas)}${writeSection('regional', regional)}${writeSection('forms', forms, true)}}\n`;
JSON.parse(json); // sanity check before overwriting the committed file

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, json);

const megaCount = Object.values(megas).reduce((n, list) => n + list.length, 0);
console.log(
  `[pokedex] ${Object.keys(species).length} espécies, ${megaCount} megas, ${Object.keys(regional).length} formas regionais, ${Object.keys(forms).length} formas especiais -> ` +
    `${path.relative(frontendRoot, outFile)} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`,
);
