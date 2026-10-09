import { useEffect, useState } from 'react';
import { PokemonSprite } from '../PokemonSprite';

interface BossBannerProps {
  src: string;
  /** Empty string = decorative. */
  alt: string;
  /** Name handed to the Pokémon sprite when the banner file fails to load. */
  fallbackName: string;
  width?: number;
  height?: number;
  eager?: boolean;
  className?: string;
}

/**
 * Wiki boss banner (round art, smooth rendering - NOT the pixelated look of the
 * sprites). Falls back to the Pokémon sprite when the file is missing, which
 * is what a build made without bd/bosses (or a stale cache) ends up with.
 */
export function BossBanner({ src, alt, fallbackName, width = 72, height, eager, className }: BossBannerProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <PokemonSprite name={fallbackName} width={width} alt="" />;
  return (
    <img
      className={`boss-banner${className ? ` ${className}` : ''}`}
      src={src}
      width={width}
      height={height ?? width}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
