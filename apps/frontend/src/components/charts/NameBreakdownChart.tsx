import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NameBreakdownRow } from '../../api/types';
import { formatCompact, formatHours } from '../../format';

export type NameBreakdownMetric = 'avgProfitPerHour' | 'avgProfit' | 'avgRareKillsPerHour' | 'totalDurationSeconds';

interface NameBreakdownChartProps {
  data: NameBreakdownRow[];
  metricKey: NameBreakdownMetric;
  seriesLabel: string;
  unitLabel: string;
  formatValue?: (value: number) => string;
}

const ROW_HEIGHT = 34;

// Horizontal bars, one per hunt/MD name, so long names stay readable on the
// category axis and the ranking reads top-to-bottom. The tooltip carries the
// sample size (hours/runs) behind each average, since a spot done once for
// 15 minutes isn't as trustworthy as one farmed for 20 hours.
export function NameBreakdownChart({
  data,
  metricKey,
  seriesLabel,
  unitLabel,
  formatValue = formatCompact,
}: NameBreakdownChartProps) {
  if (data.length === 0) return <div className="chart-empty-state">Sem registros para o período selecionado.</div>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * ROW_HEIGHT + 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--gridline)" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatValue(v)}
          stroke="var(--baseline)"
          tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--baseline)"
          tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          tickLine={false}
          width={130}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: 'var(--gridline)', opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const row = payload[0].payload as NameBreakdownRow;
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
                <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{row.name}</div>
                <div>
                  {seriesLabel}: <strong>{formatValue(row[metricKey] ?? 0)}</strong>
                </div>
                {metricKey !== 'totalDurationSeconds' && (
                  <div>
                    Horas caçadas: <strong>{formatHours(row.totalDurationSeconds)}</strong>
                  </div>
                )}
                <div style={{ color: 'var(--text-muted)' }}>
                  {row.count} {unitLabel}
                  {row.count === 1 ? '' : 's'} · profit total {formatCompact(row.totalProfit)}
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey={metricKey} name={seriesLabel} fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22}>
          <LabelList
            dataKey={metricKey}
            position="right"
            formatter={(v: number) => formatValue(v)}
            style={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
