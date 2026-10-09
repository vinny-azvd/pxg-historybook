// De-para for the Nightmare Terror bosses. The export names the enemies after
// the Pokémon ("Terror Machamp"), the PokeXGames wiki after the boss
// ("Nightmare Terror - Kairiki"). Pairs confirmed on the wiki pages: Gama
// (Venusaur), Raito (Electabuzz), Gyakkyo (Gyarados), Kame (Blastoise),
// Kairiki (Machamp), Seishin & Yurei (Alakazam & Gengar). Ptera, Riza and
// Kitsune are matched by their Japanese-style names (Aerodactyl, Charizard,
// Zoroark) and by the ten enemies seen in the exports.
const TERROR_BOSS_BY_ENEMY: Record<string, string> = {
  'terror aerodactyl': 'Ptera',
  'terror alakazam': 'Seishin',
  'terror blastoise': 'Kame',
  'terror charizard': 'Riza',
  'terror electabuzz': 'Raito',
  'terror gengar': 'Yurei',
  'terror gyarados': 'Gyakkyo',
  'terror machamp': 'Kairiki',
  'terror venusaur': 'Gama',
  'terror zoroark': 'Kitsune',
};

/** "Terror Machamp" -> "Kairiki (Terror Machamp)"; any other name comes back as is. */
export function terrorEnemyLabel(enemy: string): string {
  const boss = TERROR_BOSS_BY_ENEMY[enemy.trim().toLowerCase()];
  return boss ? `${boss} (${enemy})` : enemy;
}

/** The weekly Nightmare Terror rotation, as named in the wiki gallery. */
export const WEEKLY_TERROR_BOSSES = ['Kairiki', 'Kame', 'Ptera', 'Gama', 'Riza', 'Raito', 'Gyakkyo', 'Seishin & Yurei', 'Kitsune'];

const OTHER_BOSSES: Record<string, string> = {
  entei: 'Entei',
  raikou: 'Raikou',
  suicune: 'Suicune',
  'giant shiny tentacruel': 'Giant Shiny Tentacruel',
  'shiny giant tentacruel': 'Giant Shiny Tentacruel',
  missingno: 'Missingno',
};

/** Gallery (wiki) name of the boss an enemy row belongs to - "Terror Alakazam"
 * and "Terror Gengar" are one fight, "Seishin & Yurei" - or null when the
 * enemy isn't a boss (the adds of a fight, Darkrai Minions...). */
export function terrorBossForEnemy(enemy: string): string | null {
  const key = enemy.trim().toLowerCase();
  const nightmare = TERROR_BOSS_BY_ENEMY[key];
  if (nightmare) return nightmare === 'Seishin' || nightmare === 'Yurei' ? 'Seishin & Yurei' : nightmare;
  return OTHER_BOSSES[key] ?? null;
}
