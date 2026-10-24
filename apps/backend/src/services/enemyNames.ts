// In PXG the "Golden" form of these species IS their shiny: the export names
// it "Golden Sudowoodo", but it is a Shiny Sudowoodo. Only the species listed
// here - other Golden Pokémon are a separate thing. Mirrored in
// apps/frontend/src/enemyNames.ts (standalone mode builds the same summary).
const GOLDEN_IS_SHINY = new Set(['sudowoodo', 'steelix']);

// Likewise Megas are exported as "Enraged X" (Enraged Scizor is a Mega
// Scizor); every "Enraged" is treated as a Mega.

/** "Golden Sudowoodo" -> "Shiny Sudowoodo", "Enraged Scizor" -> "Mega Scizor"; any other name comes back as is. */
export function canonicalEnemyName(name: string): string {
  const golden = name.match(/^golden\s+(.+?)(\s*\[[^\]]*\])?\s*$/i);
  if (golden && GOLDEN_IS_SHINY.has(golden[1].trim().toLowerCase())) {
    return `Shiny ${golden[1].trim()}${golden[2] ?? ''}`;
  }
  const enraged = name.match(/^enraged\s+(.+?)\s*$/i);
  if (enraged) return `Mega ${enraged[1]}`;
  return name;
}
