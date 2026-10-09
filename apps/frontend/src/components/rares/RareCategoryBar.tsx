import type { RareSpeciesRow } from '../../api/types';
import { formatInt, formatShare } from '../../format';
import { ChartFrame } from '../charts/chartKit';
import { categoryShares } from './rareUtils';

interface RareCategoryBarProps {
  species: RareSpeciesRow[];
  unidentified: number;
  /** Party teammates' rares under a Treinador filter - see teammateRareKills. */
  teammates: number;
}

// Part-to-whole of the fixed categories as one 100% bar - a pie would turn
// the single Mega or Giant into an unreadable sliver. Every segment is
// labelled in the key underneath (count and share), so nothing depends on
// matching colors or hovering; the bar itself only shows the proportions.
// The slices add up to the "Raros no período" KPI, teammates' rares included.
export function RareCategoryBar({ species, unidentified, teammates }: RareCategoryBarProps) {
  const shares = categoryShares(species, unidentified, teammates);
  if (shares.length === 0) return <div className="empty-state">Nenhum raro no período.</div>;

  const table = {
    columns: ['Categoria', 'Raros', '% do total'],
    numericColumns: [1, 2],
    rows: shares.map((s) => ({ key: s.key, cells: [s.label, formatInt(s.count), formatShare(s.share)] })),
  };

  return (
    <ChartFrame caption="Raros por categoria" table={table}>
      <div className="rares-stack" role="img" aria-label={shares.map((s) => `${s.label}: ${s.count} (${formatShare(s.share)})`).join(', ')}>
        {shares.map((s) => (
          <div
            key={s.key}
            className="rares-stack-segment"
            style={{ flexGrow: s.count, background: s.color }}
            title={`${s.label}: ${formatInt(s.count)} (${formatShare(s.share)})`}
          />
        ))}
      </div>
      <ul className="rares-stack-key">
        {shares.map((s) => (
          <li key={s.key}>
            <span aria-hidden="true" className="legend-swatch" style={{ background: s.color, marginRight: 0 }} />
            <span className="rares-stack-key-label">{s.label}</span>
            <strong>{formatInt(s.count)}</strong>
            <span className="rares-stack-key-share">{formatShare(s.share)}</span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
