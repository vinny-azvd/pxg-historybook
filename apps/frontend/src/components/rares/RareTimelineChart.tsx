import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Rectangle, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RareTimelinePoint } from '../../api/types';
import { bucketRange, fillBucketStarts, isPartialBucket, toISODate } from '../../dates';
import { formatBucketLabel, formatDate, formatHours, formatInt, formatRate } from '../../format';
import {
  ChartFrame,
  ZOOM_HINT,
  ZOOM_HINT_SINGLE,
  ZoomCaption,
  axisTickLabel,
  niceScale,
  tooltipBoxStyle,
  tooltipHintStyle,
  useChartZoom,
} from '../charts/chartKit';
import { ORIGIN_SERIES, countScale } from './rareUtils';

type TimeBucket = 'day' | 'week' | 'month';

const BUCKET_NOUN: Record<TimeBucket, string> = { day: 'O dia de hoje', week: 'A semana atual', month: 'O mês atual' };

// Surface gap between stacked segments (the chart standard), the same 2px the
// category bar leaves between its slices.
const STACK_GAP = 2;

interface Row extends RareTimelinePoint {
  label: string;
  total: number;
  /** Raros/h of the bucket; null when no time was played in it (no rate, not a 0). */
  rate: number | null;
  /** What the rate metric plots: the rate, with 0 standing in for "no rate" (tooltip and table say "—"). */
  rateValue: number;
  partial: boolean;
  filled: boolean; // slot added to close a gap (no sessions in it)
}

interface RareTimelineChartProps {
  timeline: RareTimelinePoint[];
  bucket: TimeBucket;
  range: { from?: string; to?: string };
  origin: 'all' | 'hunt' | 'md';
  /** Click (tap) on a column: zoom into that period. Left out at the finest level
   * (one column per day), where there is nothing to expand. */
  onZoom?: (bucketStart: string) => void;
  /** Mouse drag across several columns: zoom into the selected span. */
  onZoomSpan?: (first: string, last: string) => void;
  /** Click (tap) on an empty part of the plot: back one zoom level (Power BI style). Left out at the root. */
  onZoomOut?: () => void;
}

const shortDate = (iso: string) => formatDate(iso).slice(0, 5);

// A bucket the selected range only partly covers (the week of 28/09 inside
// October) is labelled with the days actually counted, so it doesn't claim
// days outside the period.
function bucketLabel(bucketStart: string, bucket: TimeBucket, range: { from?: string; to?: string }): string {
  if (bucket === 'day') return formatBucketLabel(bucketStart, bucket);
  const full = bucketRange(bucketStart, bucket);
  const from = range.from && range.from > full.from ? range.from : full.from;
  const to = range.to && range.to < full.to ? range.to : full.to;
  if (from === full.from && to === full.to) return formatBucketLabel(bucketStart, bucket);
  return from === to ? shortDate(from) : `${shortDate(from)}–${shortDate(to)}`;
}

type Metric = 'count' | 'rate';

const RATE_SERIES = { key: 'rateValue', label: 'Raros/h', color: 'var(--series-1)' } as const;

// Columns of rare kills per day/week/month, or of Raros/h (a count per bucket
// means little without the hours played in it). Empty periods get a zero slot
// (fillBucketStarts) so a dry spell shows as a gap of zeros instead of the
// neighbours silently touching - but only up to today: weeks that haven't
// happened yet aren't a dry spell. Hunts and MD stack only when both are in
// view - a single origin needs no legend, the section title already names it.
export function RareTimelineChart({ timeline, bucket, range, origin, onZoom, onZoomSpan, onZoomOut }: RareTimelineChartProps) {
  // Kept here: the chart stays mounted while the scope/filters refetch.
  const [metric, setMetric] = useState<Metric>('count');
  const byStart = new Map(timeline.map((p) => [p.bucketStart, p]));
  const today = toISODate(new Date());
  const fillRange = { from: range.from, to: range.to && range.to > today ? today : range.to };
  const rows: Row[] = fillBucketStarts([...byStart.keys()], bucket, fillRange).map((bucketStart) => {
    const point = byStart.get(bucketStart);
    const hunt = origin === 'md' ? 0 : point?.hunt ?? 0;
    const md = origin === 'hunt' ? 0 : point?.md ?? 0;
    const durationSeconds = point?.durationSeconds ?? 0;
    // The rate counts the rares of the origins in view, over the bucket's time.
    const rate = durationSeconds > 0 ? ((hunt + md) * 3600) / durationSeconds : null;
    return {
      bucketStart,
      label: bucketLabel(bucketStart, bucket, range),
      hunt,
      md,
      durationSeconds,
      total: hunt + md,
      rate,
      rateValue: rate ?? 0,
      partial: isPartialBucket(bucketStart, bucket),
      filled: !point,
    };
  });

  const zoom = useChartZoom({
    labels: rows.map((r) => r.bucketStart),
    onZoom,
    onZoomSpan,
    onZoomOut,
    isEmpty: (label) => Boolean(rows.find((r) => r.bucketStart === label)?.filled),
  });

  if (rows.length === 0) {
    return <div className="empty-state">Nenhuma sessão no período para montar a linha do tempo.</div>;
  }

  const rateMetric = metric === 'rate';
  // The rate is one number per bucket: there is nothing to stack by origin.
  const stacked = origin === 'all' && !rateMetric;
  const series: { key: 'hunt' | 'md' | 'rateValue'; label: string; color: string }[] = rateMetric
    ? [RATE_SERIES]
    : (origin === 'all' ? (['hunt', 'md'] as const) : ([origin] as const)).map((key) => ({ key, ...ORIGIN_SERIES[key] }));
  const scale = rateMetric
    ? niceScale(Math.max(0, ...rows.map((r) => r.rateValue)))
    : countScale(Math.max(0, ...rows.map((r) => r.total)));
  const partialRow = rows.find((r) => r.partial);
  const labelOf = new Map(rows.map((r) => [r.bucketStart, r.label]));

  const table = {
    columns: ['Período', ...(origin === 'all' ? ['Hunts', 'MD'] : []), 'Raros', 'Horas jogadas', 'Raros/h'],
    numericColumns: origin === 'all' ? [1, 2, 3, 4, 5] : [1, 2, 3],
    rows: rows.map((r) => ({
      key: r.bucketStart,
      label: r.label,
      onExpand: onZoom && !r.filled ? () => onZoom(r.bucketStart) : undefined,
      cells: [
        `${r.label}${r.partial ? ' (parcial)' : ''}`,
        ...(origin === 'all' ? [formatInt(r.hunt), formatInt(r.md)] : []),
        formatInt(r.total),
        r.filled || r.durationSeconds <= 0 ? '—' : formatHours(r.durationSeconds),
        formatRate(r.rate),
      ],
    })),
  };

  return (
    <ChartFrame onZoomOut={onZoomOut} caption="Raros ao longo do tempo" table={table}>
      <div className="chart-toolbar-group rares-timeline-metric" role="group" aria-label="Métrica da linha do tempo">
        <span className="chart-toolbar-label">Mostrar</span>
        <div className="bucket-toggle">
          <button type="button" className={rateMetric ? 'secondary' : ''} aria-pressed={!rateMetric} onClick={() => setMetric('count')}>
            Raros
          </button>
          <button type="button" className={rateMetric ? '' : 'secondary'} aria-pressed={rateMetric} onClick={() => setMetric('rate')}>
            Raros/h
          </button>
        </div>
      </div>
      <div {...zoom.areaProps}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={rows}
            accessibilityLayer
            aria-label={`Gráfico de colunas: ${rateMetric ? 'raros por hora' : 'raros'} ao longo do tempo. Para expandir um período pelo teclado, use Ver tabela.`}
            margin={{ top: 12, right: 16, left: 0, bottom: 0 }}
            barCategoryGap="20%"
            {...zoom.chartProps}
          >
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              tickFormatter={(v: string) => (bucket === 'week' ? labelOf.get(v) : undefined) ?? axisTickLabel(v, bucket)}
              stroke="var(--baseline)"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              minTickGap={12}
            />
            <YAxis
              domain={scale.domain}
              ticks={scale.ticks}
              tickFormatter={(v: number) => (rateMetric ? formatRate(v) : formatInt(v))}
              stroke="var(--baseline)"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={rateMetric}
              width={rateMetric ? 48 : 40}
            />
            <Tooltip
              cursor={{ fill: 'var(--gridline)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload as Row;
                return (
                  <div style={tooltipBoxStyle}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {rateMetric ? `${formatRate(row.rate)} raros/h` : `${formatInt(row.total)} raro${row.total === 1 ? '' : 's'}`}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {bucket === 'week' ? 'Semana de ' : ''}
                      {row.label}
                      {row.partial && ' (parcial)'}
                    </div>
                    {row.filled ? (
                      <div style={{ color: 'var(--text-muted)' }}>Sem sessões neste período</div>
                    ) : (
                      <>
                        <div style={{ color: 'var(--text-muted)' }}>
                          Raros: <strong>{formatInt(row.total)}</strong>
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                          Horas jogadas: <strong>{row.durationSeconds > 0 ? formatHours(row.durationSeconds) : '—'}</strong>
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                          Raros/h: <strong>{formatRate(row.rate)}</strong>
                        </div>
                        {stacked &&
                          series.map((s) => (
                            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span aria-hidden="true" className="legend-swatch" style={{ background: s.color, marginRight: 0 }} />
                              <strong>{formatInt(row[s.key as 'hunt' | 'md'])}</strong>
                              <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                            </div>
                          ))}
                      </>
                    )}
                    {onZoom && !row.filled && <div style={tooltipHintStyle}>{onZoomSpan ? ZOOM_HINT : ZOOM_HINT_SINGLE}</div>}
                  </div>
                );
              }}
            />
            {zoom.selection && (
              <ReferenceArea
                x1={zoom.selection.from}
                x2={zoom.selection.to}
                fill="var(--selection)"
                fillOpacity={0.16}
                stroke="var(--selection)"
                strokeOpacity={0.6}
                strokeDasharray="4 3"
                ifOverflow="visible"
              />
            )}
            {series.map((s, index) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="rares"
                fill={s.color}
                maxBarSize={24}
                isAnimationActive={false}
                // Only the segment on top of each column gets the rounded cap
                // (a rounded hunt segment under an MD one leaves notches), and a
                // segment with another one above gives up its top 2px as the
                // surface gap - its base stays on the axis. The still-running
                // period is drawn faded so it doesn't read as a finished dip.
                shape={(props: any) => {
                  const row = props.payload as Row;
                  const isTop = series.slice(index + 1).every((above) => row[above.key] === 0);
                  const gap = !isTop && props.height > STACK_GAP ? STACK_GAP : 0;
                  return (
                    <Rectangle
                      {...props}
                      y={props.y + gap}
                      height={props.height - gap}
                      radius={isTop ? [4, 4, 0, 0] : 0}
                      fillOpacity={row.partial ? 0.45 : 1}
                    />
                  );
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {stacked && (
        <div className="chart-marker-legend" aria-label="Legenda">
          {series.map((s) => (
            <span key={s.key}>
              <span aria-hidden="true" className="legend-swatch" style={{ background: s.color, marginRight: 0 }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {onZoom || onZoomOut ? (
        <ZoomCaption span={Boolean(onZoomSpan)} unit="coluna" canZoom={Boolean(onZoom)} canZoomOut={Boolean(onZoomOut)} />
      ) : (
        bucket === 'day' && <p className="chart-zoom-caption">Cada coluna é um dia: é o nível mais fino desta linha do tempo.</p>
      )}
      {partialRow && (
        <p className="rares-note">
          {BUCKET_NOUN[bucket]} ({partialRow.label}) ainda está em andamento
          {partialRow.total > 0 ? ': a coluna clara é parcial.' : '.'}
        </p>
      )}
    </ChartFrame>
  );
}
