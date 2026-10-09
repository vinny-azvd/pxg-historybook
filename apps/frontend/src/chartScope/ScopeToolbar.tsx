import type { Granularity } from './windows';
import type { ChartScope } from './useChartScope';

const OPTIONS: { value: Granularity; label: string; title: string }[] = [
  { value: 'all', label: 'Tudo', title: 'Todo o período, agrupado por mês' },
  { value: 'day', label: 'Dia', title: 'Últimos 30 dias, agrupado por dia' },
  { value: 'week', label: 'Semana', title: 'Últimas 12 semanas, agrupado por semana' },
  { value: 'month', label: 'Mês', title: 'Últimos 12 meses, agrupado por mês' },
];

export interface ScopeExtraOption {
  label: string;
  title?: string;
  active: boolean;
  onSelect: () => void;
}

interface ScopeToolbarProps {
  scope: ChartScope;
  /** Replaces `scope.setGranularity` when a page has more to do on a pick
   * (the hunts page leaves "Por hunt" first). */
  onGranularity?: (granularity: Granularity) => void;
  /** A fifth button that is not a time granularity (the hunts page's "Por hunt"). */
  extra?: ScopeExtraOption;
}

/** Granularity buttons + arrows with the visible-range label + "Hoje". Reuses
 * .bucket-toggle and .period-nav, so every skin already styles it. */
export function ScopeToolbar({ scope, onGranularity, extra }: ScopeToolbarProps) {
  const extraActive = Boolean(extra?.active);
  const showNavigator = !extraActive && (scope.canGoBack || scope.canGoForward || scope.depth > 0);
  // One live region that stays mounted: a region that is inserted together with
  // its text (the label moves between two places when the navigator hides) is
  // not announced. The visible label is a plain element, also the place
  // keyboard focus is parked after a zoom.
  return (
    <div className="scope-toolbar">
      <span className="visually-hidden" role="status" aria-live="polite">
        {extraActive ? '' : scope.label}
      </span>
      {showNavigator && (
        <div className="period-nav scope-nav">
          <button
            type="button"
            className="secondary"
            onClick={() => scope.shift(-1)}
            disabled={!scope.canGoBack}
            aria-label="Período anterior"
            title="Período anterior"
          >
            ‹
          </button>
          <span className="period-nav-label scope-label" data-scope-focus tabIndex={-1}>
            {scope.label}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => scope.shift(1)}
            disabled={!scope.canGoForward}
            aria-label="Próximo período"
            title="Próximo período"
          >
            ›
          </button>
          <button type="button" className="secondary" onClick={scope.today}>
            Hoje
          </button>
        </div>
      )}
      {!showNavigator && !extraActive && (
        <span className="period-nav-label scope-label" data-scope-focus tabIndex={-1}>
          {scope.label}
        </span>
      )}
      <div className="bucket-toggle" role="group" aria-label="Tamanho de cada ponto do gráfico">
        {OPTIONS.map((opt) => {
          const on = !extraActive && scope.granularity === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={on ? '' : 'secondary'}
              aria-pressed={on}
              title={opt.title}
              onClick={() => (onGranularity ?? scope.setGranularity)(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
        {extra && (
          <button
            type="button"
            className={extra.active ? '' : 'secondary'}
            aria-pressed={extra.active}
            title={extra.title}
            onClick={extra.onSelect}
          >
            {extra.label}
          </button>
        )}
      </div>
    </div>
  );
}
