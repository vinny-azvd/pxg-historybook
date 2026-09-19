export function normalizeItemName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const EXTENSION_PRIORITY: Record<string, number> = { png: 0, webp: 1, gif: 2 };
const CATEGORY_PRIORITY: Record<string, number> = {
  itens: 0,
  engenheiro: 1,
  professor: 2,
  estilista: 3,
  aventureiro: 4,
  tasks: 5,
};

export interface RawIconEntry {
  name: string;
  category: string;
  subcategory: string;
  filename: string;
  extension: string;
  path: string;
}

export function pickBestIcon(entries: RawIconEntry[]): RawIconEntry {
  return [...entries].sort((a, b) => {
    const extDiff = (EXTENSION_PRIORITY[a.extension] ?? 99) - (EXTENSION_PRIORITY[b.extension] ?? 99);
    if (extDiff !== 0) return extDiff;
    const catDiff = (CATEGORY_PRIORITY[a.category] ?? 99) - (CATEGORY_PRIORITY[b.category] ?? 99);
    if (catDiff !== 0) return catDiff;
    return a.filename.localeCompare(b.filename);
  })[0];
}
