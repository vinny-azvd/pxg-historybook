import type { ReactNode } from 'react';
import { useFilters } from '../FiltersContext';
import { toISODate } from '../dates';
import { addDays, unitEnd } from '../chartScope/windows';
import { formatDate } from '../format';

interface Preset {
  key: string;
  label: ReactNode;
  /** Longer text for the tooltip (the label alone is just "7 dias"). */
  title: string;
  range: (today: string) => { from: string; to: string };
}

// Digits sit in span.num because the skins' pixel display font breaks them.
const lastDays = (n: number): Preset => ({
  key: `${n}d`,
  label: (
    <>
      <span className="num">{n}</span> dias
    </>
  ),
  title: `Últimos ${n} dias, até hoje`,
  range: (today) => ({ from: addDays(today, -(n - 1)), to: today }),
});

const PRESETS: Preset[] = [
  { key: 'all', label: 'Tudo', title: 'Todo o período', range: () => ({ from: '', to: '' }) },
  lastDays(7),
  lastDays(30),
  lastDays(90),
  {
    key: 'month',
    label: 'Este mês',
    title: 'O mês inteiro (o mesmo "Este mês" do filtro do topo)',
    // The whole month, like the header dropdown's "Este mês", so the two agree.
    range: (today) => {
      const first = `${today.slice(0, 8)}01`;
      return { from: first, to: unitEnd(first, 'month') };
    },
  },
  {
    key: 'year',
    label: 'Este ano',
    title: 'De 1º de janeiro até hoje',
    range: (today) => ({ from: `${today.slice(0, 4)}-01-01`, to: today }),
  },
];

/**
 * The period of the Raros tabs: ready-made ranges that write the global
 * from/to, which every section of the page follows. The group has no state of
 * its own - the active button is whichever preset equals the current range, so
 * it also follows the header dropdown and a chart zoom; a range that is none of
 * them shows as a text chip instead of leaving every button off. Children are
 * rendered as further items of the same toolbar row.
 */
export function PeriodRange({ children }: { children?: ReactNode }) {
  const { from, to, setDateRange } = useFilters();
  // Local date, never a UTC slice: after 21h in Brazil UTC is already tomorrow.
  const today = toISODate(new Date());
  const active = PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === from && r.to === to;
  });

  return (
    <div className="period-range">
      <div className="chart-toolbar rares-filters period-range-bar">
        <div className="chart-toolbar-group" role="group" aria-labelledby="period-range-label">
          <span className="chart-toolbar-label" id="period-range-label">
            Período
          </span>
          <div className="bucket-toggle rares-tier-chips">
            {PRESETS.map((p) => {
              const on = p === active;
              return (
                <button
                  key={p.key}
                  type="button"
                  className={on ? '' : 'secondary'}
                  aria-pressed={on}
                  title={p.title}
                  onClick={() => setDateRange(p.range(today))}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {!active && (
            <span className="badge period-range-custom">
              Personalizado: {from ? formatDate(from) : 'início'} a {to ? formatDate(to) : 'hoje'}
            </span>
          )}
        </div>
        {/* More items of the same row (the tier/element filters), wrapping with it. */}
        {children}
      </div>
      <p className="rares-filter-note period-range-hint">
        O período vale para toda a página: gráficos, galeria, tabela e totais.
      </p>
    </div>
  );
}
