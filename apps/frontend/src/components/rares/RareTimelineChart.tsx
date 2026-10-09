import { Bar, BarChart, CartesianGrid, Rectangle, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RareTimelinePoint } from '../../api/types';
import { bucketRange, fillBucketStarts, isPartialBucket, toISODate } from '../../dates';
import { formatBucketLabel, formatDate, formatInt } from '../../format';
import {
  ChartFrame,
  ZOOM_HINT,
  ZOOM_HINT_SINGLE,
  ZoomCaption,
  axisTickLabel,
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

// Columns of rare kills per day/week/month. Empty periods get a zero slot
// (fillBucketStarts) so a dry spell shows as a gap of zeros instead of the
// neighbours silently touching - but only up to today: weeks that haven't
// happened yet aren't a dry spell. Hunts and MD stack only when both are in
// view - a single origin needs no legend, the section title already names it.
export function RareTimelineChart({ timeline, bucket, range, origin, onZoom, onZoomSpan }: RareTimelineChartProps) {
  const byStart = new Map(timeline.map((p) => [p.bucketStart, p]));
  const today = toISODate(new Date());
  const fillRange = { from: range.from, to: range.to && range.to > today ? today : range.to };
  const rows: Row[] = fillBucketStarts([...byStart.keys()], bucket, fillRange).map((bucketStart) => {
    const point = byStart.get(bucketStart);
    const hunt = origin === 'md' ? 0 : point?.hunt ?? 0;
    const md = origin === 'hunt' ? 0 : point?.md ?? 0;
    return {
      bucketStart,
      label: bucketLabel(bucketStart, bucket, range),
      hunt,
      md,
      total: hunt + md,
      partial: isPartialBucket(bucketStart, bucket),
      filled: !point,
    };
  });

  const zoom = useChartZoom({
    labels: rows.map((r) => r.bucketStart),
    onZoom,
    onZoomSpan,
    isEmpty: (label) => Boolean(rows.find((r) => r.bucketStart === label)?.filled),
  });

  if (rows.length === 0) {
    return <div className="empty-state">Nenhuma sessão no período para montar a linha do tempo.</div>;
  }

  const stacked = origin === 'all';
  const series = stacked ? (['hunt', 'md'] as const) : ([origin] as const);
  const scale = countScale(Math.max(0, ...rows.map((r) => r.total)));
  const partialRow = rows.find((r) => r.partial);
  const labelOf = new Map(rows.map((r) => [r.bucketStart, r.label]));

  const table = {
    columns: ['Período', ...(stacked ? ['Hunts', 'MD'] : []), 'Raros'],
    numericColumns: stacked ? [1, 2, 3] : [1],
    rows: rows.map((r) => ({
      key: r.bucketStart,
      label: r.label,
      onExpand: onZoom && !r.filled ? () => onZoom(r.bucketStart) : undefined,
      cells: [
        `${r.label}${r.partial ? ' (parcial)' : ''}`,
        ...(stacked ? [formatInt(r.hunt), formatInt(r.md)] : []),
        formatInt(r.total),
      ],
    })),
  };

  return (
    <ChartFrame caption="Raros ao longo do tempo" table={table}>
      <div {...zoom.areaProps}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={rows}
            accessibilityLayer
            aria-label="Gráfico de colunas: raros ao longo do tempo. Para expandir um período pelo teclado, use Ver tabela."
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
              tickFormatter={(v: number) => formatInt(v)}
              stroke="var(--baseline)"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'var(--gridline)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload as Row;
                return (
                  <div style={tooltipBoxStyle}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {formatInt(row.total)} raro{row.total === 1 ? '' : 's'}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {bucket === 'week' ? 'Semana de ' : ''}
                      {row.label}
                      {row.partial && ' (parcial)'}
                    </div>
                    {row.filled ? (
                      <div style={{ color: 'var(--text-muted)' }}>Sem sessões neste período</div>
                    ) : (
                      stacked &&
                      series.map((key) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span aria-hidden="true" className="legend-swatch" style={{ background: ORIGIN_SERIES[key].color, marginRight: 0 }} />
                          <strong>{formatInt(row[key])}</strong>
                          <span style={{ color: 'var(--text-muted)' }}>{ORIGIN_SERIES[key].label}</span>
                        </div>
                      ))
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
            {series.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={ORIGIN_SERIES[key].label}
                stackId="rares"
                fill={ORIGIN_SERIES[key].color}
                maxBarSize={24}
                isAnimationActive={false}
                // Only the segment on top of each column gets the rounded cap
                // (a rounded hunt segment under an MD one leaves notches), and a
                // segment with another one above gives up its top 2px as the
                // surface gap - its base stays on the axis. The still-running
                // period is drawn faded so it doesn't read as a finished dip.
                shape={(props: any) => {
                  const row = props.payload as Row;
                  const isTop = series.slice(index + 1).every((above) => row[above] === 0);
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
          {series.map((key) => (
            <span key={key}>
              <span aria-hidden="true" className="legend-swatch" style={{ background: ORIGIN_SERIES[key].color, marginRight: 0 }} />
              {ORIGIN_SERIES[key].label}
            </span>
          ))}
        </div>
      )}
      {onZoom ? (
        <ZoomCaption span={Boolean(onZoomSpan)} unit="coluna" />
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
