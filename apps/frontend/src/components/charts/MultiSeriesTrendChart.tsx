import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NameCount, TopDrop } from '../../api/types';
import { formatBucketLabel, formatCompact } from '../../format';
import { getRareDrops } from '../HuntBadges';
import { TooltipNames, tooltipDetailStyle } from './TooltipNames';

type PlayerTrendMetric = 'avgProfitPerHour' | 'avgProfit' | 'totalProfit';

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
  bucket: 'day' | 'week' | 'month' | 'hunt' | 'terror' | 'md';
  metricKey?: PlayerTrendMetric;
  onPointClick?: (bucketStart: string) => void;
  selectedBucketStart?: string | null;
  rareDropThreshold?: number;
}

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
}: MultiSeriesTrendChartProps) {
  const bucketStarts = [...new Set(series.flatMap((s) => s.points.map((p) => p.bucketStart)))].sort();

  if (bucketStarts.length === 0) {
    return <div className="chart-empty-state">Sem registros para o período selecionado.</div>;
  }

  const isEntryBucket = bucket === 'hunt' || bucket === 'terror' || bucket === 'md';

  const rows = bucketStarts.map((bucketStart) => {
    const row: Record<string, string | number | null> = { bucketStart };
    for (const s of series) {
      const point = s.points.find((p) => p.bucketStart === bucketStart);
      row[fieldFor(s.playerId)] = point?.[metricKey] ?? null;
    }
    return row;
  });

  const pointByPlayerBucket = new Map<string, SeriesPoint>();
  for (const s of series) {
    for (const p of s.points) pointByPlayerBucket.set(`${s.playerId}::${p.bucketStart}`, p);
  }

  const huntNameByBucket = new Map<string, string | null>();
  if (isEntryBucket) {
    for (const s of series) {
      for (const p of s.points) {
        if (p.huntName) huntNameByBucket.set(p.bucketStart, p.huntName);
      }
    }
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart
        data={rows}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
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
            if (visible.length === 0) return null;
            return (
              <div
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 12.5,
                }}
              >
                <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {bucket === 'week' ? 'Semana de ' : ''}
                  {isEntryBucket && huntNameByBucket.get(String(label)) ? `${huntNameByBucket.get(String(label))} · ` : ''}
                  {formatBucketLabel(String(label), bucket)}
                </div>
                {visible.map((s, index) => {
                  const entry = payload.find((p: any) => p.dataKey === fieldFor(s.playerId));
                  const point = pointByPlayerBucket.get(`${s.playerId}::${String(label)}`);
                  const rareDrops = pointRareDrops(point, rareDropThreshold);
                  return (
                    <div key={s.playerId} style={{ marginTop: index > 0 && !isEntryBucket ? 4 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }}
                        />
                        {s.playerName}: <strong>{formatCompact(Number(entry?.value))}</strong>
                      </div>
                      {!isEntryBucket && (
                        <div style={{ paddingLeft: 14 }}>
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
                        <div key={drop.item} style={{ paddingLeft: 14, color: 'var(--rare-drop-badge-text)' }}>
                          💎 {drop.item} ({formatCompact(drop.unitPrice)}/un.)
                        </div>
                      ))}
                    </div>
                  );
                })}
                {onPointClick && (
                  <div style={{ color: 'var(--series-1)', marginTop: 4 }}>Clique para filtrar por este período</div>
                )}
              </div>
            );
          }}
        />
        {series.map((s) => (
          <Line
            key={s.playerId}
            type="monotone"
            dataKey={fieldFor(s.playerId)}
            name={s.playerName}
            stroke={s.color}
            strokeWidth={2}
            dot={(props: any) => {
              const value = props.payload?.[fieldFor(s.playerId)];
              if (value === null || value === undefined) return <g key={props.key} />;
              const isSelected = props.payload?.bucketStart === selectedBucketStart;
              // A ring in the rare-drop color keeps the player's own fill, so
              // the dot still says whose it is while flagging the lucky drop.
              const hasRareDrop =
                pointRareDrops(pointByPlayerBucket.get(`${s.playerId}::${props.payload?.bucketStart}`), rareDropThreshold).length > 0;
              return (
                <circle
                  key={props.key}
                  cx={props.cx}
                  cy={props.cy}
                  r={isSelected || hasRareDrop ? 6 : 3.5}
                  fill={isSelected ? 'var(--series-2)' : s.color}
                  stroke={hasRareDrop ? 'var(--rare-drop)' : 'var(--surface-1)'}
                  strokeWidth={hasRareDrop ? 2.5 : 1.5}
                />
              );
            }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
