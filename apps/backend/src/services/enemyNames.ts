// In PXG the "Golden" form of these species IS their shiny: the export names
// it "Golden Sudowoodo", but it is a Shiny Sudowoodo. Only the species listed
// here - other Golden Pokémon are a separate thing. Mirrored in
// apps/frontend/src/enemyNames.ts (standalone mode builds the same summary).
const GOLDEN_IS_SHINY = new Set(['sudowoodo', 'steelix']);

/** "Golden Sudowoodo" -> "Shiny Sudowoodo"; any other name comes back as is. */
export function canonicalEnemyName(name: string): string {
  const match = name.match(/^golden\s+(.+?)(\s*\[[^\]]*\])?\s*$/i);
  if (!match || !GOLDEN_IS_SHINY.has(match[1].trim().toLowerCase())) return name;
  return `Shiny ${match[1].trim()}${match[2] ?? ''}`;
}
