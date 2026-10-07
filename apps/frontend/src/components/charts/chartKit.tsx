import { useState, type ReactNode } from 'react';

/** A y (or x) scale that starts at zero and steps by 1/2/2,5/5 × 10^n, so tick
 * labels are round and never repeat ("0 | 1 | 1 | 2" came from letting the
 * chart pick fractional ticks and then formatting them as integers). */
export function niceScale(maxValue: number, intervals = 5): { domain: [number, number]; ticks: number[] } {
  if (!(maxValue > 0) || !Number.isFinite(maxValue)) return { domain: [0, 1], ticks: [0, 1] };
  const raw = maxValue / intervals;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw - 1e-12) ?? 10 * pow;
  const count = Math.ceil(maxValue / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
  return { domain: [0, ticks[ticks.length - 1]], ticks };
}

export type MarkerKind = 'plain' | 'rare' | 'jade' | 'jadeSevere';

interface MarkerProps {
  cx?: number;
  cy?: number;
  kind: MarkerKind;
  color: string;
  selected?: boolean;
  /** Rare drop on a multi-player line: keep the player's own fill (it says
   * whose point it is) and carry the "rare" meaning in the shape + ring. */
  keepSeriesFill?: boolean;
}

// Point states are never told apart by color alone (rare-drop gold and the
// old orange "selected" fill were the same to deuteranopes): each state has
// its own shape, and selection is a separate neutral ring.
export function ChartMarker({ cx, cy, kind, color, selected, keepSeriesFill }: MarkerProps) {
  if (cx === undefined || cy === undefined || Number.isNaN(cx) || Number.isNaN(cy)) return <g />;
  const ring = selected ? (
    <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--selection)" strokeWidth={2} />
  ) : null;
  if (kind === 'rare') {
    const r = 7;
    return (
      <g>
        {ring}
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill={keepSeriesFill ? color : 'var(--rare-drop)'}
          stroke={keepSeriesFill ? 'var(--rare-drop)' : 'var(--surface-1)'}
          strokeWidth={keepSeriesFill ? 2.5 : 2}
        />
      </g>
    );
  }
  if (kind === 'jade' || kind === 'jadeSevere') {
    const s = 10;
    return (
      <g>
        {ring}
        <rect
          x={cx - s / 2}
          y={cy - s / 2}
          width={s}
          height={s}
          rx={1.5}
          fill={kind === 'jadeSevere' ? 'var(--jade)' : 'var(--surface-1)'}
          stroke="var(--jade)"
          strokeWidth={2}
        />
      </g>
    );
  }
  return (
    <g>
      {ring}
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
    </g>
  );
}

const MARKER_LABELS: Record<Exclude<MarkerKind, 'plain'>, string> = {
  rare: 'Drop raro',
  jadeSevere: 'Jade Totem (uso alto)',
  jade: 'Jade Totem',
};

/** Key for the special point shapes actually present in the chart. */
export function MarkerLegend({ kinds }: { kinds: Set<MarkerKind> }) {
  const shown = (['rare', 'jadeSevere', 'jade'] as const).filter((k) => kinds.has(k));
  if (shown.length === 0) return null;
  return (
    <div className="chart-marker-legend">
      {shown.map((kind) => (
        <span key={kind}>
          <svg width={16} height={16} aria-hidden="true">
            <ChartMarker cx={8} cy={8} kind={kind} color="var(--series-1)" />
          </svg>
          {MARKER_LABELS[kind]}
        </span>
      ))}
    </div>
  );
}

/** A short line swatch: the tooltip key for a line series (a dot reads as a
 * point, not as "this line"). */
export function LineKey({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ width: 14, height: 3, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />;
}

export interface ChartTableData {
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
  /** Columns holding numbers, right-aligned so digits line up. */
  numericColumns?: number[];
}

/** Wraps a chart with a "Ver tabela" toggle that swaps the plot for the same
 * data as a plain table - the accessible fallback (screen readers, keyboard,
 * colorblind readers, exact values) every chart is expected to have. */
export function ChartFrame({ caption, table, children }: { caption: string; table: ChartTableData; children: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="chart-frame">
      <div className="chart-frame-bar">
        <button type="button" className="secondary chart-table-toggle" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>
      {showTable ? (
        <div className="chart-table-wrap">
          <table className="data-table chart-table">
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} scope="col" className={table.numericColumns?.includes(i) ? 'num' : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.key}>
                  {row.cells.map((cell, i) => (
                    <td key={i} className={table.numericColumns?.includes(i) ? 'num' : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export const tooltipBoxStyle = {
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12.5,
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
} as const;

export const tooltipHintStyle = { color: 'var(--text-muted)', marginTop: 4, fontSize: 11.5, fontStyle: 'italic' } as const;
