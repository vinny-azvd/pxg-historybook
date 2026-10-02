import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const bdDir = path.resolve(frontendRoot, '../../bd');
const destDir = path.join(frontendRoot, 'public', 'static', 'items');

const srcJson = path.join(bdDir, 'image-database.json');
const srcImages = path.join(bdDir, 'images');

if (!fs.existsSync(srcJson) || !fs.existsSync(srcImages)) {
  console.warn(`[copy-icons] bd/ não encontrado em ${bdDir}, pulando cópia de ícones (modo local ficará sem ícones).`);
  process.exit(0);
}

// icon_url (built in apps/frontend/src/api/local/icons.ts, mirroring the
// backend's seedItemIcons.ts) strips the leading "images/" off each entry's
// `path` - e.g. "images/itens/Water Gem.png" -> ".../static/items/itens/Water
// Gem.png". So bd/images' CONTENTS must land directly under static/items/,
// not nested under an extra static/items/images/ folder.
fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(srcJson, path.join(destDir, 'image-database.json'));
fs.cpSync(srcImages, destDir, { recursive: true });

console.log(`[copy-icons] copiado bd/image-database.json + bd/images -> ${path.relative(frontendRoot, destDir)}`);
