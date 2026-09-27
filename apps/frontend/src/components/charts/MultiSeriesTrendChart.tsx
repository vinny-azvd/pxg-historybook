import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBucketLabel, formatCompact } from '../../format';

type PlayerTrendMetric = 'avgProfitPerHour' | 'avgProfit';

export interface PlayerSeries {
  playerId: number;
  playerName: string;
  color: string;
  points: {
    bucketStart: string;
    avgProfitPerHour: number | null;
    avgProfit?: number | null;
    huntName?: string | null;
  }[];
}

interface MultiSeriesTrendChartProps {
  series: PlayerSeries[];
  bucket: 'day' | 'week' | 'month' | 'hunt' | 'terror' | 'md';
  metricKey?: PlayerTrendMetric;
  onPointClick?: (bucketStart: string) => void;
  selectedBucketStart?: string | null;
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
}: MultiSeriesTrendChartProps) {
  const bucketStarts = [...new Set(series.flatMap((s) => s.points.map((p) => p.bucketStart)))].sort();

  if (bucketStarts.length === 0) {
    return <div className="chart-empty-state">Sem dados suficientes para o gráfico.</div>;
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
                {visible.map((s) => {
                  const entry = payload.find((p: any) => p.dataKey === fieldFor(s.playerId));
                  return (
                    <div key={s.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }}
                      />
                      {s.playerName}: <strong>{formatCompact(Number(entry?.value))}</strong>
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
              return (
                <circle
                  key={props.key}
                  cx={props.cx}
                  cy={props.cy}
                  r={isSelected ? 6 : 3.5}
                  fill={isSelected ? 'var(--series-2)' : s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={1.5}
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
