// Ported verbatim from apps/backend/src/services/itemIconMatcher.ts (pure
// functions, no backend-specific dependencies).
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

let iconMap: Map<string, string> | null = null;
let loadPromise: Promise<Map<string, string>> | null = null;

async function fetchIcons(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const url = `${import.meta.env.BASE_URL}static/items/image-database.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return map;
    const entries: RawIconEntry[] = await res.json();

    const grouped = new Map<string, RawIconEntry[]>();
    for (const entry of entries) {
      const key = normalizeItemName(entry.name);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }

    for (const [normalized, candidates] of grouped) {
      const best = pickBestIcon(candidates);
      // Same path-stripping logic as seedItemIcons.ts, but prefixed with
      // BASE_URL instead of the backend's hardcoded '/static/items/'.
      map.set(normalized, `${import.meta.env.BASE_URL}static/items/${best.path.replace(/^images\//, '')}`);
    }
  } catch {
    // Best-effort: if the bundled icon database isn't reachable, icons just
    // don't resolve (getIconUrl returns null) - nothing else breaks.
  }
  return map;
}

/** Loads (once per page session) and caches the item-name -> icon-url map. */
export function loadIcons(): Promise<Map<string, string>> {
  if (iconMap) return Promise.resolve(iconMap);
  if (!loadPromise) {
    loadPromise = fetchIcons().then((map) => {
      iconMap = map;
      return map;
    });
  }
  return loadPromise;
}

export function getIconUrl(itemNameNormalized: string): string | null {
  return iconMap?.get(itemNameNormalized) ?? null;
}
