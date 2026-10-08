import { useEffect, useState } from 'react';
import { pokeballFallback, pokemonSprite, type SpriteOptions } from '../pokemon';

interface PokemonSpriteProps extends SpriteOptions {
  /** Pokémon / hunt name; unknown names render a Pokéball. */
  name: string;
  /** Rendered size in CSS px (the files are 96px sprites). */
  width?: number;
  height?: number;
  className?: string;
  /** Defaults to the name. Pass "" when the name is written right next to it. */
  alt?: string;
}

/**
 * Small local sprite with a Pokéball fallback for unknown names and files
 * that failed to load (builds made without network). Pixelated rendering is
 * set by .pokemon-sprite in styles.css.
 */
export function PokemonSprite({ name, width = 64, height, className, alt, shiny, back }: PokemonSpriteProps) {
  const src = pokemonSprite(name, { shiny, back });
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const decorative = alt === '';
  return (
    <img
      className={`pokemon-sprite${className ? ` ${className}` : ''}`}
      src={failed || !src ? pokeballFallback() : src}
      width={width}
      height={height ?? width}
      alt={alt ?? name}
      aria-hidden={decorative ? true : undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
