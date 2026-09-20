export interface EnemyCount {
  enemy: string;
  count: number;
}

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

/** Client-side mirror of the backend's deriveHuntName, used to show a live
 * suggested name in the upload confirmation dialog before anything is sent. */
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
