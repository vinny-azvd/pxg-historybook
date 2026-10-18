import { formatBucketLabel } from '../../format';
import { monthShort } from '../../chartScope/windows';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

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

/** x-axis tick text: short (the tooltip and table carry the long form), so a
 * 30-day or 12-month axis keeps most of its labels instead of skipping them. */
export function axisTickLabel(bucketStart: string, bucket: 'day' | 'week' | 'month' | 'hunt' | 'terror' | 'md'): string {
  // A week is named by the day it starts on (the tooltip spells out the range).
  if (bucket === 'day' || bucket === 'week') return `${bucketStart.slice(8, 10)}/${bucketStart.slice(5, 7)}`;
  if (bucket === 'month') return monthShort(bucketStart).replace(/\/\d\d(\d\d)$/, '/$1');
  return formatBucketLabel(bucketStart, bucket);
}

/** x-axis tick placement of the time charts. Recharts' own thinning drops most
 * labels on a phone (2 of 12 weeks), so with the plot width known (the
 * ResponsiveContainer's `onResize`) every n-th label is kept instead, counting
 * back from the latest period, which is the one that matters most. */
export function useAxisTicks(starts: string[], bucket: string) {
  const [width, setWidth] = useState(0);
  const onResize = useCallback((w: number) => setWidth(Math.round(w)), []);
  const timeBucket = bucket === 'day' || bucket === 'week' || bucket === 'month';
  if (!timeBucket || width <= 0 || starts.length === 0) {
    return { onResize, xAxis: { interval: 'preserveStartEnd', minTickGap: 6 } as const };
  }
  const labelWidth = bucket === 'month' ? 46 : 36;
  const perSlot = Math.max(1, width - 56 - 16) / starts.length;
  const step = Math.max(1, Math.ceil((labelWidth + 8) / perSlot));
  const ticks = starts.filter((_, i) => (starts.length - 1 - i) % step === 0);
  return { onResize, xAxis: { ticks, interval: 0, minTickGap: 0 } as const };
}

export type MarkerKind = 'plain' | 'rare' | 'jade' | 'jadeSevere';

interface MarkerProps {
  cx?: number;
  cy?: number;
  kind: MarkerKind;
  color: string;
  /** Rare drop on a multi-player line: keep the player's own fill (it says
   * whose point it is) and carry the "rare" meaning in the shape + ring. */
  keepSeriesFill?: boolean;
}

// Point states are never told apart by color alone (rare-drop gold and the
// old orange "selected" fill were the same to deuteranopes): each state has
// its own shape.
export function ChartMarker({ cx, cy, kind, color, keepSeriesFill }: MarkerProps) {
  if (cx === undefined || cy === undefined || Number.isNaN(cx) || Number.isNaN(cy)) return <g />;
  if (kind === 'rare') {
    const r = 7;
    return (
      <g>
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
  /** `onExpand` adds an "Expandir" button on that row (keyboard / screen-reader
   * way to zoom into a period, same as clicking its point on the chart). */
  rows: { key: string; cells: ReactNode[]; onExpand?: () => void; label?: string }[];
  /** Columns holding numbers, right-aligned so digits line up. */
  numericColumns?: number[];
}

/** Wraps a chart with a "Ver tabela" toggle that swaps the plot for the same
 * data as a plain table - the accessible fallback (screen readers, keyboard,
 * colorblind readers, exact values) every chart is expected to have. */
// "Ver tabela" is remembered per chart (and page): zooming swaps the data (and
// may remount the chart while it loads), and someone browsing the table with the
// keyboard should still be in the table afterwards, focus included. Other pages
// keep their own choice (several share the same caption).
const tableViewByChart = new Map<string, boolean>();
let refocusExpandUntil = 0;

// True while a drag-selection is in progress: Esc then cancels the selection
// and must not also step back out of the zoom.
let dragInProgress = false;

function dialogIsOpen(): boolean {
  return Boolean(document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]'));
}

export function ChartFrame({
  caption,
  table,
  children,
  onZoomOut,
}: {
  caption: string;
  table: ChartTableData;
  children: ReactNode;
  /** Esc with focus inside the frame (chart, table or its buttons) steps back one zoom level. */
  onZoomOut?: () => void;
}) {
  const { pathname } = useLocation();
  const memoryKey = `${pathname}|${caption}`;
  const [showTable, setShowTableState] = useState(() => tableViewByChart.get(memoryKey) ?? false);
  const setShowTable = (next: (current: boolean) => boolean) => {
    const value = next(showTable);
    tableViewByChart.set(memoryKey, value);
    setShowTableState(value);
  };
  const expandable = table.rows.some((row) => row.onExpand);
  const tableWrap = useRef<HTMLDivElement>(null);
  const rowsSignature = table.rows.map((row) => row.key).join('|');
  useEffect(() => {
    if (!showTable || Date.now() > refocusExpandUntil) return;
    refocusExpandUntil = 0;
    const target = tableWrap.current?.querySelector<HTMLElement>('button.scope-expand-btn') ?? tableWrap.current;
    target?.focus();
  }, [showTable, rowsSignature]);
  return (
    <div
      className="chart-frame"
      onKeyDown={
        onZoomOut
          ? (e) => {
              if (e.key !== 'Escape' || e.defaultPrevented || dragInProgress || dialogIsOpen()) return;
              const target = e.target as HTMLElement;
              if (target.closest('input, select, textarea, [role="combobox"], [aria-expanded="true"]')) return;
              onZoomOut();
            }
          : undefined
      }
    >
      <div className="chart-frame-bar">
        <button type="button" className="secondary chart-table-toggle" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>
      {showTable ? (
        <div className="chart-table-wrap" ref={tableWrap} tabIndex={-1}>
          <table className="data-table chart-table">
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} scope="col" className={table.numericColumns?.includes(i) ? 'num' : undefined}>
                    {c}
                  </th>
                ))}
                {expandable && <th scope="col">Expandir</th>}
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
                  {expandable && (
                    <td>
                      {row.onExpand && (
                        <button
                          type="button"
                          className="secondary scope-expand-btn"
                          aria-label={`Expandir ${row.label ?? String(row.cells[0] ?? row.key)}`}
                          onClick={() => {
                            refocusExpandUntil = Date.now() + 4000;
                            row.onExpand?.();
                          }}
                        >
                          Expandir
                        </button>
                      )}
                    </td>
                  )}
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

/** Tooltip line telling how to zoom. */
export const ZOOM_HINT = 'Clique para expandir · arraste para selecionar vários';
export const ZOOM_HINT_SINGLE = 'Clique para expandir';

/** Small caption under a zoomable chart (touch screens get the tap wording).
 * `unit` is what the reader clicks: a point on a line chart, a column on bars. */
export function ZoomCaption({
  span,
  unit = 'ponto',
  canZoom = true,
  canZoomOut = false,
}: {
  span: boolean;
  unit?: 'ponto' | 'coluna';
  /** False at the finest level, where nothing is left to expand. */
  canZoom?: boolean;
  /** Zoomed in (something to go back to): teach the click-outside-to-go-back gesture. */
  canZoomOut?: boolean;
}) {
  const article = unit === 'coluna' ? 'numa' : 'num';
  const plural = unit === 'coluna' ? 'as colunas' : 'os pontos';
  if (!canZoom && !canZoomOut) return null;
  return (
    <p className="chart-zoom-caption">
      {canZoom && (
        <>
          <span className="hint-fine">
            {span ? `Clique ${article} ${unit} para expandir · arraste para selecionar vários períodos.` : `Clique ${article} ${unit} para expandir.`}
          </span>
          <span className="hint-coarse">{`Toque ${article} ${unit} para expandir.`}</span>{' '}
        </>
      )}
      {canZoomOut && (
        <>
          <span className="hint-fine">{`Clique fora d${plural} para voltar.`}</span>
          <span className="hint-coarse">{`Toque fora d${plural} para voltar.`}</span>{' '}
        </>
      )}
      {canZoom && <span>Pelo teclado: Ver tabela, depois Expandir.</span>}
      {canZoomOut && <span>{canZoom ? ' Esc volta um nível.' : 'Pelo teclado: Esc volta um nível.'}</span>}
    </p>
  );
}

/** Is the click on a bar or a point? Power BI style: only an empty part of the
 * plot means "back". Bars and dots are found in the DOM (Recharts gives the
 * chart-level click no hit information) with a little slack, since a dot is 8px
 * wide and a one-rare bar a few px tall; a finger gets more. */
function clickHitsMark(event: { target: EventTarget | null; clientX: number; clientY: number } | undefined, coarse: boolean): boolean {
  const target = event?.target as Element | null | undefined;
  if (!event || !target || typeof target.closest !== 'function') return false;
  const root = target.closest('.recharts-wrapper');
  if (!root) return false;
  const slackDot = coarse ? 26 : 18;
  const slackBar = coarse ? 8 : 3;
  const near = (el: Element, slack: number) => {
    const r = el.getBoundingClientRect();
    return event.clientX >= r.left - slack && event.clientX <= r.right + slack && event.clientY >= r.top - slack && event.clientY <= r.bottom + slack;
  };
  for (const bar of root.querySelectorAll('.recharts-bar-rectangle')) {
    // A zero-height bar is no bar (an origin with nothing in that slot).
    if (bar.getBoundingClientRect().height >= 0.5 && near(bar, slackBar)) return true;
  }
  for (const dot of root.querySelectorAll('.recharts-line-dots circle, .recharts-line-dots polygon, .recharts-line-dots rect')) {
    if (near(dot, slackDot)) return true;
  }
  return false;
}

export interface ZoomSelection {
  from: string;
  to: string;
}

interface UseChartZoomOptions {
  /** bucketStart of every row, in axis order. */
  labels: string[];
  /** Click (or tap) on a point: expand into it. */
  onZoom?: (bucketStart: string) => void;
  /** Mouse/pen drag across several points: expand into the span (first <= last). */
  onZoomSpan?: (first: string, last: string) => void;
  /** Slots without data do not react to a plain click. */
  isEmpty?: (bucketStart: string) => boolean;
  /** Click on an EMPTY part of the plot (no bar/point under it): step back one zoom
   * level, like Power BI. Left out at the root. Zooming in, a drag-selection, the
   * tooltip and the axes never trigger it. */
  onZoomOut?: () => void;
}

/** Click-to-zoom + drag-to-select for a Recharts category chart. The returned
 * `chartProps` go on the chart (LineChart), `areaProps` on a div wrapping it,
 * and `selection` feeds a <ReferenceArea>. Drag selection is mouse/pen only:
 * touch keeps tap-to-zoom (and page scrolling). A drag that ends on the point it
 * started on is just a click. Escape cancels a drag in progress. */
export function useChartZoom({ labels, onZoom, onZoomSpan, isEmpty, onZoomOut }: UseChartZoomOptions) {
  const [selection, setSelection] = useState<ZoomSelection | null>(null);
  const drag = useRef<{ start: string; last: string } | null>(null);
  const pointerType = useRef('mouse');
  const suppressClick = useRef(false);
  // Where the pointer went down: a press on a mark that is released somewhere else
  // is a cancelled gesture, not a click on empty plot.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const live = useRef({ labels, onZoom, onZoomSpan, isEmpty, onZoomOut });
  live.current = { labels, onZoom, onZoomSpan, isEmpty, onZoomOut };
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanup.current?.();
      dragInProgress = false;
    },
    []
  );

  // Runs on the mouseup of a cancelled drag: the click that follows is eaten
  // before it reaches the chart (and the listener goes away with the tick).
  const swallowNextClick = useCallback(() => {
    const eat = (e: Event) => {
      e.stopPropagation();
      window.removeEventListener('click', eat, true);
    };
    window.addEventListener('click', eat, true);
    window.setTimeout(() => window.removeEventListener('click', eat, true), 0);
  }, []);

  const ordered = useCallback((a: string, b: string): [string, string] => {
    const list = live.current.labels;
    return list.indexOf(a) <= list.indexOf(b) ? [a, b] : [b, a];
  }, []);

  const labelOf = (state: unknown): string | null => {
    const label = (state as { activeLabel?: unknown } | null)?.activeLabel;
    return typeof label === 'string' ? label : null;
  };

  const onMouseDown = (state: unknown, event?: { button?: number }) => {
    if (!live.current.onZoomSpan || pointerType.current === 'touch') return;
    if (event && typeof event.button === 'number' && event.button !== 0) return;
    const label = labelOf(state);
    if (!label) return;
    drag.current = { start: label, last: label };
    dragInProgress = true;
    cleanup.current?.();
    const finish = (commit: boolean) => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      cleanup.current = null;
      dragInProgress = false;
      const d = drag.current;
      drag.current = null;
      setSelection(null);
      if (!commit) {
        // Cancelled with Esc while the button is still down: the mouseup (and the
        // click it makes) comes later and must not zoom into the point under the pointer.
        window.addEventListener('mouseup', swallowNextClick, { once: true });
        return;
      }
      if (d && d.start !== d.last) {
        // The click that follows this mouseup must not also zoom into one point.
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        const [a, b] = ordered(d.start, d.last);
        live.current.onZoomSpan?.(a, b);
      }
    };
    const onUp = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    cleanup.current = () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  };

  const onMouseMove = (state: unknown, event?: { type?: unknown }) => {
    const d = drag.current;
    if (!d) return;
    // Recharts' accessibilityLayer fakes a "mouse move" (a bare {pageX, pageY}
    // object, no real event) on the first point whenever the chart gets focus,
    // which a mousedown does. That is not the pointer: skip it.
    if (!event || typeof event.type !== 'string') return;
    const label = labelOf(state);
    if (!label || label === d.last) return;
    d.last = label;
    if (label === d.start) {
      setSelection(null);
      return;
    }
    const [from, to] = ordered(d.start, label);
    setSelection({ from, to });
  };

  const onClick = (
    state: unknown,
    event?: { target: EventTarget | null; clientX: number; clientY: number; detail?: number }
  ) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    // The 2nd click of a double click: after the 1st one zoomed in, the chart was
    // redrawn and the 2nd lands on empty plot - it would zoom straight back out.
    if ((event?.detail ?? 1) > 1) return;
    const down = pressedAt.current;
    if (down && event && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    // No active label = the click was outside the plot (axes, margins).
    const label = labelOf(state);
    if (!label) return;
    const target = event?.target as Element | null | undefined;
    if (target?.closest?.('.recharts-tooltip-wrapper')) return;
    const selected = window.getSelection();
    if (selected && !selected.isCollapsed && selected.toString().trim()) return;
    if (clickHitsMark(event, pointerType.current === 'touch')) {
      if (!live.current.isEmpty?.(label)) live.current.onZoom?.(label);
      return;
    }
    live.current.onZoomOut?.();
  };

  const zoomable = Boolean(onZoom);
  return {
    selection,
    zoomable,
    chartProps: {
      onMouseDown,
      onMouseMove,
      onClick,
      style: onZoom || onZoomOut ? { cursor: 'pointer' } : undefined,
    },
    areaProps: {
      className: zoomable ? 'chart-zoom-area' : undefined,
      onPointerDown: (e: ReactPointerEvent) => {
        pointerType.current = e.pointerType;
        pressedAt.current = { x: e.clientX, y: e.clientY };
      },
    },
  };
}
