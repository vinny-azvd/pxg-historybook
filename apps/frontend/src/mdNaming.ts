// Client-side mirror of the backend's deriveMdName, used to show a live
// suggested name in the upload confirmation dialog before anything is sent.
// Like Terror, an MD export's "Enemies Defeated" is empty ({}) - the only
// place enemy names show up is the Damage log. Unlike Terror there's no known
// "boss" prefix to filter by, so every distinct enemy counts: if there's
// exactly one, that's the MD's name; with more than one, naming is left to
// the user (the full list still shows up in the preview to help them pick).
export function extractMdEnemies(damage: { Enemy: string }[]): string[] {
  const names = new Set<string>();
  for (const row of damage) {
    const trimmed = row.Enemy.trim();
    if (trimmed) names.add(trimmed);
  }
  return [...names];
}

export function deriveMdName(damage: { Enemy: string }[]): string | null {
  const enemies = extractMdEnemies(damage);
  return enemies.length === 1 ? enemies[0] : null;
}
