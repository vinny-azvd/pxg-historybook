import { pokemonTypes } from '../../pokemon';

/**
 * First type of the card's Pokémon, written to the card as data-type so a skin
 * can tint it from the --type-<tipo> tokens (the Cartas skin does; the other
 * skins ignore it). Undefined when the name has no known species, which the
 * skin renders as a neutral card.
 */
export function cardType(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return pokemonTypes(name)[0];
}
