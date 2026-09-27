// Client-side mirror of the backend's deriveTerrorName, used to show a live
// suggested name in the upload confirmation dialog before anything is sent.
// Unlike Hunts, a Terror export's "Enemies Defeated" is empty ({}) - the only
// place boss names show up is the Damage log's Enemy field, prefixed with
// "Terror " (as opposed to "Nightmare X" support/add enemies also logged there).
const BOSS_PREFIX = /^terror\s+/i;

export function extractTerrorBosses(damage: { Enemy: string }[]): string[] {
  const names = new Set<string>();
  for (const row of damage) {
    const trimmed = row.Enemy.trim();
    if (BOSS_PREFIX.test(trimmed)) {
      names.add(trimmed.replace(BOSS_PREFIX, '').trim());
    }
  }
  return [...names];
}

export function deriveTerrorName(damage: { Enemy: string }[]): string | null {
  const bosses = extractTerrorBosses(damage);
  if (bosses.length === 0) return null;
  if (bosses.length === 1) return bosses[0];
  return `${bosses.length} bosses`;
}
