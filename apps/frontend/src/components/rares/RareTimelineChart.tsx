import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RareTimelinePoint } from '../../api/types';
import { bucketRange, fillBucketStarts, isPartialBucket, toISODate, type PeriodScope } from '../../dates';
import { formatBucketLabel, formatDate, formatInt } from '../../format';
import { ChartFrame, tooltipBoxStyle } from '../charts/chartKit';
import { ORIGIN_SERIES, countScale } from './rareUtils';

type TimeBucket = 'day' | 'week' | 'month';

const BUCKET_NOUN: Record<TimeBucket, string> = { day: 'O dia de hoje', week: 'A semana atual', month: 'O mês atual' };
const SINGLE_BUCKET: Record<TimeBucket, string> = { day: 'um único dia', week: 'uma única semana', month: 'um único mês' };

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
  /** The period toggle in use - picks the advice when there's only one column. */
  scope: PeriodScope;
  origin: 'all' | 'hunt' | 'md';
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
export function RareTimelineChart({ timeline, bucket, range, scope, origin }: RareTimelineChartProps) {
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

  if (rows.length < 2) {
    return (
      <div className="empty-state">
        {scope === 'day'
          ? 'Um único dia não forma uma linha do tempo - escolha Semana, Mês ou Tudo para comparar períodos.'
          : `Todas as sessões do período caíram em ${SINGLE_BUCKET[bucket]} - não há outros períodos para comparar.`}
      </div>
    );
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
      cells: [
        `${r.label}${r.partial ? ' (parcial)' : ''}`,
        ...(stacked ? [formatInt(r.hunt), formatInt(r.md)] : []),
        formatInt(r.total),
      ],
    })),
  };

  return (
    <ChartFrame caption="Raros ao longo do tempo" table={table}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} accessibilityLayer margin={{ top: 12, right: 16, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="bucketStart"
            tickFormatter={(v: string) => labelOf.get(v) ?? formatBucketLabel(v, bucket)}
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
                </div>
              );
            }}
          />
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
      {partialRow && (
        <p className="rares-note">
          {BUCKET_NOUN[bucket]} ({partialRow.label}) ainda está em andamento
          {partialRow.total > 0 ? ': a coluna clara é parcial.' : '.'}
        </p>
      )}
    </ChartFrame>
  );
}
