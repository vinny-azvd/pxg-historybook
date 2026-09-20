export interface EnemyCount {
  enemy: string;
  count: number;
}

// Common variant prefixes this game uses on top of a species name (Nightmare
// Luxray, Shiny Luxray, ...). Used as a fallback when there's only one
// distinct enemy in the hunt, so a single-variant hunt still resolves to the
// species name instead of the full "Nightmare X" label.
const KNOWN_MODIFIERS = new Set([
  'nightmare',
  'shiny',
  'shadow',
  'dark',
  'mega',
  'alolan',
  'galarian',
  'hisuian',
  'paldean',
  'corrupted',
  'ancient',
  'radiant',
  'crystal',
  'crystalized',
]);

function stripKnownModifier(name: string): string {
  const words = name.split(/\s+/);
  if (words.length > 1 && KNOWN_MODIFIERS.has(words[0].toLowerCase())) {
    return words.slice(1).join(' ');
  }
  return name;
}

/**
 * Derives a display name for the hunt from its defeated-enemy list, e.g.
 * "Nightmare Luxray" (813) + "Shiny Luxray" (9) -> "Luxray". Variants of the
 * same species typically share a trailing word (the species name) while the
 * leading word is a modifier (Nightmare/Shiny/...), so we look for the
 * longest common word suffix across all distinct enemies first, falling
 * back to the most-killed enemy's full name (with a known modifier prefix
 * stripped) when the enemies don't share one (a genuinely mixed hunt, or a
 * hunt with only a single enemy variant).
 */
export function deriveHuntName(entries: EnemyCount[]): string | null {
  const byName = new Map<string, number>();
  for (const { enemy, count } of entries) {
    const name = enemy.trim();
    if (!name) continue;
    byName.set(name, (byName.get(name) ?? 0) + count);
  }

  const unique = [...byName.entries()].map(([enemy, count]) => ({ enemy, count }));
  if (unique.length === 0) return null;
  if (unique.length === 1) return stripKnownModifier(unique[0].enemy);

  const wordLists = unique.map((u) => u.enemy.split(/\s+/));
  const minLen = Math.min(...wordLists.map((w) => w.length));
  const suffixWords: string[] = [];
  for (let i = 1; i <= minLen; i++) {
    const wordsAtPos = wordLists.map((w) => w[w.length - i]);
    if (wordsAtPos.every((w) => w === wordsAtPos[0])) {
      suffixWords.unshift(wordsAtPos[0]);
    } else {
      break;
    }
  }
  if (suffixWords.length > 0) return suffixWords.join(' ');

  const primary = [...unique].sort((a, b) => b.count - a.count)[0];
  return stripKnownModifier(primary.enemy);
}
