import { tierLabel, type ShinyTier } from '../shinyTiers';

interface TierBadgeProps {
  tier: ShinyTier | null;
  /** The Pokémon left the roulette: said in text, not as a seventh colour. */
  removed?: boolean;
}

/** "Tier 1B" / "Fora da roleta" tag. The label always carries the meaning (the
 * hue only echoes the roulette's), and the tier code goes in span.num because
 * the skins' pixel display font breaks digits. */
export function TierBadge({ tier, removed }: TierBadgeProps) {
  const text = tierLabel(tier);
  const suffix = removed ? ' (removido da roleta)' : '';
  return (
    <span className={`tier-badge tier-${tier ? tier.toLowerCase() : 'out'}`} title={`${text}${suffix}`}>
      {tier ? (
        <>
          Tier <span className="num">{tier}</span>
        </>
      ) : (
        text
      )}
      {removed && <span className="tier-badge-removed"> · removido</span>}
    </span>
  );
}
