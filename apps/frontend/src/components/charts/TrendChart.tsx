import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../../api/types';
import { formatCompact, formatDate } from '../../format';

interface TrendChartProps {
  data: TrendPoint[];
  metricKey: keyof TrendPoint;
  seriesLabel: string;
  seriesColor: string;
  formatValue?: (value: number) => string;
}

export function TrendChart({ data, metricKey, seriesLabel, seriesColor, formatValue = formatCompact }: TrendChartProps) {
  if (data.length === 0) {
    return <div className="empty-state">Sem dados suficientes para o gráfico.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--gridline)" vertical={false} />
        <XAxis
          dataKey="bucketStart"
          tickFormatter={(v) => formatDate(v)}
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
          contentStyle={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12.5,
          }}
          labelFormatter={(v) => formatDate(String(v))}
          formatter={(value: number) => [formatValue(value), seriesLabel]}
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
