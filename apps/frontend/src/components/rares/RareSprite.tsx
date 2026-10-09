import { useState } from 'react';
import { parsePokemonName, pokeballFallback, pokemonSprite, variantBadges } from '../../pokemon';

interface RareSpriteProps {
  name: string;
  size: number;
  className?: string;
}

/** Official shiny/mega sprite (base species for Golden/Giant/...), or a
 * Pokéball when the name isn't a Pokémon or the file is missing - the image
 * is decoration next to the name, so it carries no alt text of its own. */
export function RareSprite({ name, size, className }: RareSpriteProps) {
  const src = pokemonSprite(name);
  const [failed, setFailed] = useState(false);
  return (
    <img
      className={`rare-sprite${className ? ` ${className}` : ''}`}
      src={failed || !src ? pokeballFallback() : src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Variant badges (Shiny, Golden...) plus "NC" when some of these rares came
 * from a Nightmare Crystal. Text, not color, says what each one is. */
export function RareBadges({ name, nightmareCrystal }: { name: string; nightmareCrystal?: boolean }) {
  const badges = variantBadges(name);
  if (badges.length === 0 && !nightmareCrystal) return null;
  return (
    <span className="rare-badges">
      {badges.map((badge) => (
        <span key={badge} className="badge rare-badge">
          {badge}
        </span>
      ))}
      {nightmareCrystal && (
        <span className="badge badge-jade" title="Spawn do Nightmare Crystal">
          NC
        </span>
      )}
    </span>
  );
}

/** Name without the variant prefixes the badges already show ("Golden
 * Sudowoodo" -> "Sudowoodo" + [Golden]). Only those words go: a regional
 * prefix ("Alolan Muk") or a mega suffix ("Charizard X") has no badge, so it
 * stays in the name. */
export function baseName(name: string): string {
  if (!parsePokemonName(name).species) return name;
  const prefixes = new Set(variantBadges(name).map((b) => b.toLowerCase()));
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && prefixes.has(words[0].toLowerCase())) words.shift();
  return words.join(' ');
}
