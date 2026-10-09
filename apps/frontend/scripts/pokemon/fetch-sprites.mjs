// Prebuild step: copies the small (96px) PokeAPI sprites - front, shiny and
// back - for every id in src/data/pokedex.json into
// public/static/pokemon/{normal,shiny,back}/{id}.png, so the site serves them
// itself (no third-party requests from visitors, works on GitHub Pages under
// the Vite base path).
//
// PokeAPI/sprites is a ~10 GB repo, so instead of cloning it this does a
// shallow, blobless, sparse fetch of ONE pinned commit (sprites-commit.json):
// only the trees plus the ~3k small PNGs we need are downloaded, into
// apps/frontend/.cache/pokeapi-sprites (gitignored, cached by the Pages
// workflow). Re-runs at the same commit don't touch the network.
//
// Never fails the build: without network (or git) it warns and the app falls
// back to a Pokéball placeholder (see pokeballFallback in src/pokemon.ts).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '../..');
const cacheDir = path.join(frontendRoot, '.cache', 'pokeapi-sprites');
const destDir = path.join(frontendRoot, 'public', 'static', 'pokemon');
const pokedexFile = path.join(frontendRoot, 'src', 'data', 'pokedex.json');
const { repo: REPO, commit: COMMIT } = JSON.parse(fs.readFileSync(path.join(__dirname, 'sprites-commit.json'), 'utf8'));

// Written inside .git only after a checkout finished, so an interrupted run
// (Ctrl+C, network drop mid-checkout) isn't mistaken for a complete cache.
const checkoutStamp = path.join(cacheDir, '.git', 'pxg-checkout-complete');
// Records what public/static/pokemon was built from, to skip the copy too.
const destStamp = path.join(destDir, '.stamp');

// Non-cone patterns: `*` doesn't cross '/', so the female/, other/ and
// versions/ subfolders (the bulk of the 10 GB) are never downloaded.
const SPARSE_PATTERNS = ['/sprites/pokemon/*.png', '/sprites/pokemon/shiny/*.png', '/sprites/pokemon/back/*.png'];
const KINDS = {
  normal: 'sprites/pokemon',
  shiny: 'sprites/pokemon/shiny',
  back: 'sprites/pokemon/back',
};

const log = (msg) => console.log(`[fetch-sprites] ${msg}`);
const warn = (msg) => console.warn(`[fetch-sprites] AVISO: ${msg}`);

function git(args) {
  return execFileSync('git', args, {
    cwd: cacheDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // Never hang on a credential prompt or a dead connection in CI.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 10 * 60 * 1000,
  }).trim();
}

function readStamp(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

function ensureCheckout() {
  if (readStamp(checkoutStamp) === COMMIT) {
    log(`cache já está no commit ${COMMIT.slice(0, 7)}, sem download`);
    return true;
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(path.join(cacheDir, '.git'))) {
    git(['init', '--quiet']);
    git(['remote', 'add', 'origin', REPO]);
  }
  // Set the sparse patterns by hand rather than via `git sparse-checkout set`,
  // which refuses to run before the repo has a HEAD.
  git(['config', 'core.sparseCheckout', 'true']);
  git(['config', 'core.sparseCheckoutCone', 'false']);
  fs.mkdirSync(path.join(cacheDir, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(cacheDir, '.git', 'info', 'sparse-checkout'), `${SPARSE_PATTERNS.join('\n')}\n`);

  log(`baixando sprites do commit ${COMMIT.slice(0, 7)} (sparse, sem histórico)...`);
  // GitHub allows fetching an exact commit; --filter=blob:none defers blobs
  // so the checkout below only downloads the files matching the patterns.
  git(['fetch', '--quiet', '--depth=1', '--filter=blob:none', 'origin', COMMIT]);
  git(['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--force', COMMIT]);
  const head = git(['rev-parse', 'HEAD']);
  if (head !== COMMIT) throw new Error(`HEAD ${head} != ${COMMIT}`);
  fs.writeFileSync(checkoutStamp, `${COMMIT}\n`);
  return true;
}

function spriteIds() {
  const pokedex = JSON.parse(fs.readFileSync(pokedexFile, 'utf8'));
  // id -> base species id, used to fill gaps (e.g. a mega without a back
  // sprite borrows its species' back sprite).
  const baseOf = new Map();
  for (const [name, entry] of Object.entries(pokedex.species)) {
    baseOf.set(entry.id, entry.id);
    for (const mega of pokedex.megas[name] ?? []) baseOf.set(mega.id, entry.id);
  }
  for (const [key, entry] of Object.entries(pokedex.regional)) {
    const speciesName = key.slice(0, key.lastIndexOf('-'));
    baseOf.set(entry.id, pokedex.species[speciesName]?.id ?? entry.id);
  }
  return baseOf;
}

function copySprites(baseOf, cacheCommit) {
  const pokedexHash = crypto.createHash('sha1').update(fs.readFileSync(pokedexFile)).digest('hex').slice(0, 12);
  // Keyed by the commit actually in the cache (an older one when offline), so
  // the next online run recopies after updating the cache.
  const wanted = `${cacheCommit}:${pokedexHash}`;
  if (readStamp(destStamp) === wanted) {
    log(`public/static/pokemon já atualizado (${baseOf.size} ids), nada a copiar`);
    return;
  }

  fs.rmSync(destDir, { recursive: true, force: true });
  for (const kind of Object.keys(KINDS)) fs.mkdirSync(path.join(destDir, kind), { recursive: true });

  const src = (kind, id) => path.join(cacheDir, KINDS[kind], `${id}.png`);
  const exists = (file) => fs.existsSync(file);
  let copied = 0;
  let bytes = 0;
  const substituted = [];
  const missing = [];

  for (const [id, baseId] of baseOf) {
    // Fallback order chosen so every file keeps the right facing and form
    // whenever possible; only a fully absent sprite is left to the runtime
    // Pokéball placeholder.
    const candidates = {
      normal: [src('normal', id), src('normal', baseId)],
      shiny: [src('shiny', id), src('normal', id), src('shiny', baseId)],
      back: [src('back', id), src('back', baseId)],
    };
    for (const [kind, list] of Object.entries(candidates)) {
      const found = list.find(exists);
      if (!found) {
        missing.push(`${kind}/${id}`);
        continue;
      }
      if (found !== list[0]) substituted.push(`${kind}/${id}`);
      const dest = path.join(destDir, kind, `${id}.png`);
      fs.copyFileSync(found, dest);
      copied += 1;
      bytes += fs.statSync(dest).size;
    }
  }

  fs.writeFileSync(destStamp, `${wanted}\n`);
  log(
    `${copied} sprites (${(bytes / 1024 / 1024).toFixed(1)} MB) -> ${path.relative(frontendRoot, destDir)}; ` +
      `${substituted.length} substituídos por sprite equivalente, ${missing.length} ausentes`,
  );
  if (substituted.length) log(`substituídos: ${substituted.join(', ')}`);
  if (missing.length) log(`ausentes (Pokébola no app): ${missing.join(', ')}`);
}

const started = Date.now();
if (!fs.existsSync(pokedexFile)) {
  warn(`${path.relative(frontendRoot, pokedexFile)} não encontrado; rode scripts/pokemon/generate-pokedex.mjs. Sprites ignorados.`);
  process.exit(0);
}

let ready = false;
try {
  ready = ensureCheckout();
} catch (err) {
  const detail = (err.stderr || err.message || String(err)).toString().trim().split('\n').pop();
  warn(`não foi possível baixar os sprites (${detail}). O app mostrará a Pokébola no lugar.`);
  // A previous complete checkout (older commit) is still better than nothing.
  ready = readStamp(checkoutStamp) !== null;
  if (ready) warn('usando sprites de um download anterior em cache.');
}

if (ready) copySprites(spriteIds(), readStamp(checkoutStamp));
log(`concluído em ${((Date.now() - started) / 1000).toFixed(1)}s`);
