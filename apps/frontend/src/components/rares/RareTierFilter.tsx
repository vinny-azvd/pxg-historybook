import { SHINY_TIERS } from '../../shinyTiers';
import type { RareTierKey } from './rareUtils';

const OPTIONS: RareTierKey[] = [...SHINY_TIERS, 'out'];

interface RareTierFilterProps {
  selected: ReadonlySet<RareTierKey>;
  onChange: (next: Set<RareTierKey>) => void;
}

// Multi-select chips: none selected means "every tier" (the "Todos" chip),
// so the filter never leaves the page empty by itself. The tier code goes in
// span.num because the skins' pixel display font breaks digits.
export function RareTierFilter({ selected, onChange }: RareTierFilterProps) {
  function toggle(tier: RareTierKey) {
    const next = new Set(selected);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    onChange(next);
  }
  return (
    <div className="chart-toolbar-group" role="group" aria-label="Filtrar por tier">
      <span className="chart-toolbar-label">Tier</span>
      <div className="bucket-toggle rares-tier-chips">
        <button type="button" className={selected.size === 0 ? '' : 'secondary'} aria-pressed={selected.size === 0} onClick={() => onChange(new Set())}>
          Todos
        </button>
        {OPTIONS.map((tier) => (
          <button
            key={tier}
            type="button"
            className={selected.has(tier) ? '' : 'secondary'}
            aria-pressed={selected.has(tier)}
            onClick={() => toggle(tier)}
          >
            {tier === 'out' ? 'Fora da roleta' : <span className="num">{tier}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
