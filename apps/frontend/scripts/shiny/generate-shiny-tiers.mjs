// Builds src/data/shinyTiers.json from the roulette project's data.json (tiers)
// and removed_pokemon.json. The images (imgSrc) are dropped on purpose: sprites
// come from pokemon.ts (PokeAPI). Re-run when the roulette catalog changes:
//   node scripts/shiny/generate-shiny-tiers.mjs <path-to-roleta-shinies>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node generate-shiny-tiers.mjs <path-to-roleta-shinies>');
  process.exit(1);
}

const readJson = (file) => JSON.parse(readFileSync(resolve(source, file), 'utf8').replace(/^﻿/, ''));
const slim = (p) => ({ name: p.name, dex: Number(p.dex.replace('#', '')) });

const data = readJson('data.json');
const removed = readJson('removed_pokemon.json');

const tiers = {};
for (const [tier, list] of Object.entries(data)) tiers[tier.replace('Tier_', '')] = list.map(slim);

const out = { tiers, removed: removed.map(slim) };
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/data/shinyTiers.json');
writeFileSync(target, JSON.stringify(out, null, 1) + '\n');
const total = Object.values(tiers).reduce((n, l) => n + l.length, 0);
console.log(`${total} Pokémon in ${Object.keys(tiers).length} tiers, ${removed.length} removed -> ${target}`);
