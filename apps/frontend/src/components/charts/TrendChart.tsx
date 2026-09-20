import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../../api/types';
import { formatBucketLabel, formatCompact } from '../../format';
import { getRareDrops } from '../HuntBadges';

interface TrendChartProps {
  data: TrendPoint[];
  metricKey: keyof TrendPoint;
  seriesLabel: string;
  seriesColor: string;
  bucket?: 'day' | 'week' | 'month' | 'hunt';
  formatValue?: (value: number) => string;
  onPointClick?: (bucketStart: string) => void;
  selectedBucketStart?: string | null;
  rareDropThreshold?: number;
}

function pointColor(payload: TrendPoint | undefined, rareDropThreshold: number, fallback: string): string | null {
  if (!payload) return null;
  if (payload.jadeSevere) return 'var(--jade)';
  if ((payload.jadeTotemCount ?? 0) > 0) return 'var(--jade-soft)';
  if (payload.topDrops && getRareDrops(payload.topDrops, rareDropThreshold).length > 0) return 'var(--rare-drop)';
  return null;
}

export function TrendChart({
  data,
  metricKey,
  seriesLabel,
  seriesColor,
  bucket = 'week',
  formatValue = formatCompact,
  onPointClick,
  selectedBucketStart,
  rareDropThreshold = 1_000_000,
}: TrendChartProps) {
  if (data.length === 0) {
    return <div className="empty-state">Sem dados suficientes para o gráfico.</div>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={data}
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
            tickFormatter={(v) => formatValue(v)}
            stroke="var(--baseline)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0].payload as TrendPoint;
              const value = row[metricKey] as number | null;
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
                    {bucket === 'hunt' && row.huntName ? row.huntName : ''}
                    {bucket === 'hunt' && row.huntName ? ' · ' : ''}
                    {formatBucketLabel(String(label), bucket)}
                  </div>
                  <div>
                    {seriesLabel}: <strong>{value === null || value === undefined ? '—' : formatValue(value)}</strong>
                  </div>
                  {bucket !== 'hunt' && (
                    <div style={{ color: 'var(--text-muted)' }}>
                      {row.huntCount} hunt{row.huntCount === 1 ? '' : 's'}
                    </div>
                  )}
                  {bucket === 'hunt' && (row.jadeTotemCount ?? 0) > 0 && (
                    // --jade/--jade-soft are tuned as chart-marker fills, not
                    // text-on-surface colors (the soft variant fails WCAG
                    // contrast as text - ~1.7:1 in light theme). Severity is
                    // shown by weight instead, using the badge-safe token.
                    <div style={{ color: 'var(--jade-badge-text)', fontWeight: row.jadeSevere ? 700 : 400 }}>
                      🟢 Jade Totem{row.jadeSevere ? ' (severo)' : ''} × {row.jadeTotemCount}
                    </div>
                  )}
                  {bucket === 'hunt' &&
                    getRareDrops(row.topDrops ?? [], rareDropThreshold).map((drop) => (
                      <div key={drop.item} style={{ color: 'var(--rare-drop-badge-text)' }}>
                        💎 {drop.item} ({formatCompact(drop.unitPrice)}/un.)
                      </div>
                    ))}
                  {onPointClick && (
                    <div style={{ color: 'var(--series-1)', marginTop: 4 }}>Clique para filtrar por este período</div>
                  )}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey={metricKey}
            name={seriesLabel}
            stroke={seriesColor}
            strokeWidth={2}
            dot={(props: any) => {
              const isSelected = props.payload?.bucketStart === selectedBucketStart;
              const modifierColor = pointColor(props.payload, rareDropThreshold, seriesColor);
              const fill = isSelected ? 'var(--series-2)' : modifierColor ?? seriesColor;
              return (
                <circle
                  key={props.key}
                  cx={props.cx}
                  cy={props.cy}
                  r={isSelected || modifierColor ? 6 : 4}
                  fill={fill}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      {onPointClick && (
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0', textAlign: 'center' }}>
          Clique num ponto do gráfico para focar o dashboard naquele período.
        </p>
      )}
    </div>
  );
}
