import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NameCount, TopDrop } from '../../api/types';
import { fillBucketStarts, isPartialBucket } from '../../dates';
import { formatBucketLabel, formatCompact, formatFull } from '../../format';
import { getRareDrops } from '../HuntBadges';
import { TooltipNames, tooltipDetailStyle } from './TooltipNames';
import { ChartFrame, ChartMarker, LineKey, MarkerLegend, niceScale, tooltipBoxStyle, tooltipHintStyle, type MarkerKind } from './chartKit';

type PlayerTrendMetric = 'avgProfitPerHour' | 'avgProfit' | 'totalProfit';
type Bucket = 'day' | 'week' | 'month' | 'hunt' | 'terror' | 'md';

export interface PlayerSeries {
  playerId: number;
  playerName: string;
  color: string;
  points: {
    bucketStart: string;
    avgProfitPerHour?: number | null;
    avgProfit?: number | null;
    totalProfit?: number | null;
    huntName?: string | null;
    names?: NameCount[];
    topDrops?: TopDrop[];
    // Overview only: one line per content type (Hunts/Terror/MD) blended
    // into this point, so the tooltip can still say what made up the total.
    details?: PointDetail[];
  }[];
}

export interface PointDetail {
  label: string;
  value: number;
  names?: NameCount[];
  topDrops?: TopDrop[];
}

type SeriesPoint = PlayerSeries['points'][number];

// An Overview point carries its drops per content type - pool them, keeping
// each item once, so the tooltip lists every rare drop behind the total.
function pointRareDrops(point: SeriesPoint | undefined, threshold: number): TopDrop[] {
  if (!point) return [];
  const drops = point.details ? point.details.flatMap((d) => d.topDrops ?? []) : point.topDrops ?? [];
  const byItem = new Map<string, TopDrop>();
  for (const drop of getRareDrops(drops, threshold)) {
    const existing = byItem.get(drop.item);
    if (!existing || drop.unitPrice > existing.unitPrice) byItem.set(drop.item, drop);
  }
  return [...byItem.values()].sort((a, b) => b.unitPrice - a.unitPrice);
}

interface MultiSeriesTrendChartProps {
  series: PlayerSeries[];
  bucket: Bucket;
  metricKey?: PlayerTrendMetric;
  onPointClick?: (bucketStart: string) => void;
  selectedBucketStart?: string | null;
  rareDropThreshold?: number;
  /** The period being browsed, so empty days/weeks/months keep their slot. */
  range?: { from?: string; to?: string };
}

// Direct end-of-line labels help identify lines without hunting the legend,
// but past a handful they collide - the legend alone carries identity then.
const MAX_DIRECT_LABELS = 4;

function fieldFor(playerId: number) {
  return `p${playerId}`;
}

export function MultiSeriesTrendChart({
  series,
  bucket,
  metricKey = 'avgProfitPerHour',
  onPointClick,
  selectedBucketStart,
  rareDropThreshold = 1_000_000,
  range,
}: MultiSeriesTrendChartProps) {
  const dataStarts = [...new Set(series.flatMap((s) => s.points.map((p) => p.bucketStart)))].sort();

  if (dataStarts.length === 0) {
    return <div className="chart-empty-state">Sem registros para o período selecionado.</div>;
  }

  const isEntryBucket = bucket === 'hunt' || bucket === 'terror' || bucket === 'md';
  const bucketStarts = isEntryBucket ? dataStarts : fillBucketStarts(dataStarts, bucket, range);
  // A summed total of zero is a real value (nothing earned that day); an
  // average/rate of an empty day is not, so those lines break instead.
  const emptyValue = metricKey === 'totalProfit' ? 0 : null;

  const pointByPlayerBucket = new Map<string, SeriesPoint>();
  for (const s of series) {
    for (const p of s.points) pointByPlayerBucket.set(`${s.playerId}::${p.bucketStart}`, p);
  }

  const rows = bucketStarts.map((bucketStart) => {
    const row: Record<string, string | number | null> = { bucketStart };
    for (const s of series) {
      const point = pointByPlayerBucket.get(`${s.playerId}::${bucketStart}`);
      row[fieldFor(s.playerId)] = point ? point[metricKey] ?? null : emptyValue;
    }
    return row;
  });

  const huntNameByBucket = new Map<string, string | null>();
  if (isEntryBucket) {
    for (const s of series) {
      for (const p of s.points) {
        if (p.huntName) huntNameByBucket.set(p.bucketStart, p.huntName);
      }
    }
  }

  const values = rows.flatMap((r) => series.map((s) => r[fieldFor(s.playerId)])).filter((v): v is number => typeof v === 'number');
  const scale = niceScale(Math.max(0, ...values));
  const lastIndexBySeries = new Map(
    series.map((s) => [s.playerId, rows.reduce((last, r, i) => (typeof r[fieldFor(s.playerId)] === 'number' ? i : last), -1)])
  );
  // End labels sit at each line's last value; when two of those land within a
  // label's height of each other the names would print on top of one another,
  // so skip them and let the legend carry identity alone.
  const lastValues = series
    .map((s) => {
      const i = lastIndexBySeries.get(s.playerId) ?? -1;
      return { i, v: i >= 0 ? (rows[i][fieldFor(s.playerId)] as number) : null };
    })
    .filter((e) => e.v !== null)
    .sort((a, b) => a.i - b.i || (a.v as number) - (b.v as number));
  const labelsCollide = lastValues.some(
    (e, k) => k > 0 && e.i === lastValues[k - 1].i && Math.abs((e.v as number) - (lastValues[k - 1].v as number)) < scale.domain[1] * 0.08
  );
  const showDirectLabels = series.length >= 2 && series.length <= MAX_DIRECT_LABELS && !labelsCollide;
  const labelRoom = Math.min(160, 16 + 7 * Math.max(...series.map((s) => s.playerName.length)));

  const kindFor = (playerId: number, bucketStart: string): MarkerKind =>
    pointRareDrops(pointByPlayerBucket.get(`${playerId}::${bucketStart}`), rareDropThreshold).length > 0 ? 'rare' : 'plain';
  const kinds = new Set(rows.flatMap((r) => series.map((s) => kindFor(s.playerId, String(r.bucketStart)))));

  const table = {
    columns: ['Período', ...series.map((s) => s.playerName)],
    numericColumns: series.map((_, i) => i + 1),
    rows: rows.map((r) => ({
      key: String(r.bucketStart),
      cells: [
        `${formatBucketLabel(String(r.bucketStart), bucket)}${isEntryBucket && huntNameByBucket.get(String(r.bucketStart)) ? ` · ${huntNameByBucket.get(String(r.bucketStart))}` : ''}`,
        ...series.map((s) => {
          const v = r[fieldFor(s.playerId)];
          return typeof v === 'number' ? formatCompact(v) : '—';
        }),
      ],
    })),
  };

  return (
    <ChartFrame caption="Comparação por treinador" table={table}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={rows}
          accessibilityLayer
          margin={{ top: 12, right: showDirectLabels ? labelRoom : 16, left: 0, bottom: 0 }}
          style={onPointClick ? { cursor: 'pointer' } : undefined}
          onClick={(state) => {
            const label = state?.activeLabel;
            if (onPointClick && typeof label === 'string') onPointClick(label);
          }}
        >
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="bucketStart"
            tickFormatter={(v) => formatBucketLabel(v, bucket)}
            stroke="var(--baseline)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            domain={scale.domain}
            ticks={scale.ticks}
            tickFormatter={(v) => formatCompact(v)}
            stroke="var(--baseline)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const visible = series.filter((s) => {
                const entry = payload.find((p: any) => p.dataKey === fieldFor(s.playerId));
                return entry && entry.value !== null && entry.value !== undefined;
              });
              const partial = !isEntryBucket && isPartialBucket(String(label), bucket as 'day' | 'week' | 'month');
              return (
                <div style={tooltipBoxStyle}>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {bucket === 'week' ? 'Semana de ' : ''}
                    {isEntryBucket && huntNameByBucket.get(String(label)) ? `${huntNameByBucket.get(String(label))} · ` : ''}
                    {formatBucketLabel(String(label), bucket)}
                    {partial && ' (parcial)'}
                  </div>
                  {visible.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Sem hunts neste período</div>}
                  {visible.map((s, index) => {
                    const entry = payload.find((p: any) => p.dataKey === fieldFor(s.playerId));
                    const point = pointByPlayerBucket.get(`${s.playerId}::${String(label)}`);
                    const rareDrops = pointRareDrops(point, rareDropThreshold);
                    const value = Number(entry?.value);
                    return (
                      <div key={s.playerId} style={{ marginTop: index > 0 && !isEntryBucket ? 4 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <LineKey color={s.color} />
                          {s.playerName}: <strong title={formatFull(value)}>{formatCompact(value)}</strong>
                        </div>
                        {!isEntryBucket && (
                          <div style={{ paddingLeft: 20 }}>
                            {point?.details
                              ? point.details.map((d) =>
                                  d.names && d.names.length > 0 ? (
                                    <TooltipNames key={d.label} prefix={`${d.label} ${formatCompact(d.value)} —`} names={d.names} />
                                  ) : (
                                    <div key={d.label} style={tooltipDetailStyle}>
                                      {d.label} {formatCompact(d.value)}
                                    </div>
                                  )
                                )
                              : <TooltipNames names={point?.names} />}
                          </div>
                        )}
                        {rareDrops.map((drop) => (
                          <div key={drop.item} style={{ paddingLeft: 20, color: 'var(--rare-drop-badge-text)' }}>
                            💎 {drop.item} ({formatCompact(drop.unitPrice)}/un.)
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {onPointClick && visible.length > 0 && <div style={tooltipHintStyle}>Clique para filtrar por este período</div>}
                </div>
              );
            }}
          />
          {series.map((s) => (
            <Line
              key={s.playerId}
              type="linear"
              dataKey={fieldFor(s.playerId)}
              name={s.playerName}
              stroke={s.color}
              strokeWidth={2}
              dot={(props: any) => (
                <ChartMarker
                  key={props.key}
                  cx={props.value === null || props.value === undefined ? undefined : props.cx}
                  cy={props.cy}
                  kind={kindFor(s.playerId, props.payload?.bucketStart)}
                  color={s.color}
                  keepSeriesFill
                  selected={props.payload?.bucketStart === selectedBucketStart}
                />
              )}
              label={
                showDirectLabels
                  ? (props: any) =>
                      props.index === lastIndexBySeries.get(s.playerId) ? (
                        <text key={`label-${s.playerId}`} x={props.x + 10} y={props.y + 4} fontSize={12} fill="var(--text-secondary)">
                          {s.playerName}
                        </text>
                      ) : (
                        <g key={`label-${s.playerId}-${props.index}`} />
                      )
                  : undefined
              }
              activeDot={{ r: 6, stroke: 'var(--surface-1)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <MarkerLegend kinds={kinds} />
    </ChartFrame>
  );
}
