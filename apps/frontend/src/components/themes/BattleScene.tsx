import { useEffect, useState } from 'react';
import type { OverviewStats } from '../../api/types';
import { formatCompact, formatFull, formatInt, formatRate } from '../../format';
import { useSkin } from '../../theme/ThemeContext';
import { PokemonSprite } from '../PokemonSprite';

/**
 * Arena of the Batalha skin, shown at the top of the Hunts dashboard only
 * (desktop >= 960px, collapsible). It restates numbers that the stat tiles and
 * highlight cards below already carry - nothing here is exclusive, so the
 * scene can be hidden without losing information:
 *  - foe side: the most profitable hunt of the period (its sprite),
 *  - your side: the most frequent hunt (back sprite),
 *  - two bars (one colour, labelled "% do recorde"): the period's average
 *    Profit/h and Raros/h against the best single hunt of that period,
 *  - a static narrator box (aria-live) with the same facts as text.
 * No typewriter text, no looping animation; hover motion is gated behind
 * (hover: hover) and prefers-reduced-motion in battle.css.
 */

const MIN_WIDTH_QUERY = '(min-width: 960px)';
const COLLAPSED_KEY = 'pxg-hunts:battle-scene-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function storeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    // Private mode / blocked storage: the choice just won't persist.
  }
}

function useWideViewport(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MIN_WIDTH_QUERY).matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MIN_WIDTH_QUERY);
    const onChange = () => setWide(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/** avg as a 0-100 share of the period's best; null when there is no record to compare with. */
function shareOfRecord(avg: number | null | undefined, max: number | null | undefined): number | null {
  if (avg == null || max == null || !(max > 0) || !Number.isFinite(avg)) return null;
  return Math.max(0, Math.min(100, Math.round((avg / max) * 100)));
}

interface ScoreBarProps {
  label: string;
  share: number | null;
}

function ScoreBar({ label, share }: ScoreBarProps) {
  return (
    <div className="battle-score">
      <span className="battle-score-label">
        {label} · {share === null ? 'sem recorde' : `${share}% do recorde`}
      </span>
      <span className="battle-score-track" aria-hidden="true">
        <span className="battle-score-fill" style={{ width: `${share ?? 0}%` }} />
      </span>
    </div>
  );
}

interface BattleSceneProps {
  overview: OverviewStats;
}

export function BattleScene({ overview }: BattleSceneProps) {
  const { skin } = useSkin();
  const wide = useWideViewport();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  if (skin !== 'battle' || !wide) return null;

  const best = overview.mostProfitableHunt;
  const frequent = overview.mostFrequentHunt;
  const bestName = best?.huntName ?? (best ? 'Hunt' : null);
  const profitShare = shareOfRecord(overview.avgProfitPerHour, overview.maxProfitPerHour);
  const rareShare = shareOfRecord(overview.avgRareKillsPerHour, overview.maxRareKillsPerHour);

  const sentences: string[] = [];
  if (best && bestName) sentences.push(`Hunt mais lucrativa: ${bestName}, ${formatCompact(best.profitPerHour)}/h.`);
  if (frequent) {
    sentences.push(`Hunt mais feita: ${frequent.huntName} (${frequent.count} hunt${frequent.count === 1 ? '' : 's'}).`);
  }
  if (overview.totalRareKills > 0) {
    sentences.push(`${formatInt(overview.totalRareKills)} raro${overview.totalRareKills === 1 ? '' : 's'} no período.`);
  }
  const narration =
    sentences.length > 0 ? sentences.join(' ') : 'Nenhuma hunt no período selecionado. Ajuste os filtros para ver a cena.';

  function toggle() {
    setCollapsed((prev) => {
      storeCollapsed(!prev);
      return !prev;
    });
  }

  return (
    <section className="battle-scene" aria-labelledby="battle-scene-title">
      <div className="battle-scene-bar">
        <h2 className="section-title battle-scene-title" id="battle-scene-title">
          Cena do período
        </h2>
        <button
          type="button"
          className="secondary battle-scene-toggle"
          aria-expanded={!collapsed}
          aria-controls="battle-scene-body"
          onClick={toggle}
        >
          {collapsed ? 'Mostrar cena' : 'Recolher cena'}
        </button>
      </div>

      <div id="battle-scene-body" hidden={collapsed}>
        <div className="battle-arena">
          <div className="battle-pad battle-pad-foe" aria-hidden="true" />
          <div className="battle-pad battle-pad-me" aria-hidden="true" />

          {best && (
            <PokemonSprite
              name={best.huntName ?? ''}
              width={192}
              alt=""
              className="battle-mon battle-mon-foe"
            />
          )}
          {frequent && (
            <PokemonSprite name={frequent.huntName} back width={288} alt="" className="battle-mon battle-mon-me" />
          )}

          <div className="battle-box battle-box-foe">
            <p className="battle-box-caption">Hunt mais lucrativa</p>
            <div className="battle-box-row">
              <span className="battle-box-name">{bestName ?? 'Sem hunts'}</span>
              <span className="battle-box-value" title={best ? `${formatFull(best.profitPerHour)}/h` : undefined}>
                {best ? `${formatCompact(best.profitPerHour)}/h` : '—'}
              </span>
            </div>
            <ScoreBar label="Profit/h médio" share={profitShare} />
            <span className="battle-box-note">média do período: {formatCompact(overview.avgProfitPerHour)}/h</span>
          </div>

          <div className="battle-box battle-box-me">
            <p className="battle-box-caption">Hunt mais feita</p>
            <div className="battle-box-row">
              <span className="battle-box-name">{frequent?.huntName ?? 'Sem hunts'}</span>
              <span className="battle-box-value">
                {frequent ? `${frequent.count} hunt${frequent.count === 1 ? '' : 's'}` : '—'}
              </span>
            </div>
            <ScoreBar label="Raros/h médio" share={rareShare} />
            <span className="battle-box-note">
              média do período: {formatRate(overview.avgRareKillsPerHour)} raros/h
            </span>
          </div>
        </div>

        <div className="battle-narrator">
          <p className="battle-narrator-text" aria-live="polite">
            {narration}
          </p>
        </div>
      </div>
    </section>
  );
}
