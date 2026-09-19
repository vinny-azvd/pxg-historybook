import fs from 'node:fs';
import { ITEM_DATABASE_JSON } from '../config.js';
import { db, withTransaction } from './connection.js';
import { normalizeItemName, pickBestIcon, type RawIconEntry } from '../services/itemIconMatcher.js';

export function seedItemIcons() {
  if (!fs.existsSync(ITEM_DATABASE_JSON)) {
    console.warn(`[seedItemIcons] arquivo não encontrado: ${ITEM_DATABASE_JSON}, pulando seed de ícones.`);
    return;
  }

  const raw = fs.readFileSync(ITEM_DATABASE_JSON, 'utf-8');
  const entries: RawIconEntry[] = JSON.parse(raw);

  const grouped = new Map<string, RawIconEntry[]>();
  for (const entry of entries) {
    const key = normalizeItemName(entry.name);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }

  const insert = db.prepare(`
    INSERT INTO item_icons (name, name_normalized, category, subcategory, filename, extension, relative_path, icon_url)
    VALUES (@name, @name_normalized, @category, @subcategory, @filename, @extension, @relative_path, @icon_url)
    ON CONFLICT(name_normalized) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      subcategory = excluded.subcategory,
      filename = excluded.filename,
      extension = excluded.extension,
      relative_path = excluded.relative_path,
      icon_url = excluded.icon_url
  `);

  withTransaction(() => {
    db.exec('DELETE FROM item_icons');
    for (const [normalized, candidates] of grouped) {
      const best = pickBestIcon(candidates);
      insert.run({
        name: best.name,
        name_normalized: normalized,
        category: best.category,
        subcategory: best.subcategory || null,
        filename: best.filename,
        extension: best.extension,
        relative_path: best.path,
        icon_url: `/static/items/${best.path.replace(/^images\//, '')}`,
      });
    }
  });

  console.log(`[seedItemIcons] ${grouped.size} ícones indexados a partir de ${entries.length} entradas.`);
}
