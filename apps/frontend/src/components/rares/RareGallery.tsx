import type { RareSpeciesRow } from '../../api/types';
import { formatDateTime, formatInt, formatRelativeDate } from '../../format';
import { pokemonTypes, typeColor } from '../../pokemon';
import { RareBadges, RareSprite, baseName } from './RareSprite';

// The friendly side of the page: every rare species met in the period as a
// card, most kills first. Same data as the ranking chart, laid out as a
// collection rather than a comparison.
export function RareGallery({ species }: { species: RareSpeciesRow[] }) {
  if (species.length === 0) return <div className="empty-state">Nenhum raro identificado no período.</div>;
  return (
    <ul className="rares-gallery">
      {species.map((s) => (
        <li key={s.enemy} className="rares-gallery-card" style={{ ['--t' as string]: typeColor(pokemonTypes(s.enemy)[0]) }}>
          <RareSprite name={s.enemy} size={96} className="rares-gallery-sprite" />
          <span className="rares-gallery-name" title={s.enemy}>
            {baseName(s.enemy)}
          </span>
          <RareBadges name={s.enemy} nightmareCrystal={s.nightmareCrystalCount > 0} />
          <span className="rares-gallery-count">
            <strong>× {formatInt(s.count)}</strong>
          </span>
          <span className="rares-gallery-seen" title={formatDateTime(s.lastAt)}>
            Último: {formatRelativeDate(s.lastAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
