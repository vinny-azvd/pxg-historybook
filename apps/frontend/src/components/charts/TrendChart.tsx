import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../../api/types';
import { formatBucketLabel, formatCompact } from '../../format';

interface TrendChartProps {
  data: TrendPoint[];
  metricKey: keyof TrendPoint;
  seriesLabel: string;
  seriesColor: string;
  bucket?: 'day' | 'week' | 'month';
  formatValue?: (value: number) => string;
}

export function TrendChart({
  data,
  metricKey,
  seriesLabel,
  seriesColor,
  bucket = 'week',
  formatValue = formatCompact,
}: TrendChartProps) {
  if (data.length === 0) {
    return <div className="empty-state">Sem dados suficientes para o gráfico.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                  {formatBucketLabel(String(label), bucket)}
                </div>
                <div>
                  {seriesLabel}: <strong>{value === null || value === undefined ? '—' : formatValue(value)}</strong>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {row.huntCount} hunt{row.huntCount === 1 ? '' : 's'}
                </div>
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
          dot={{ r: 4, fill: seriesColor, stroke: 'var(--surface-1)', strokeWidth: 2 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
