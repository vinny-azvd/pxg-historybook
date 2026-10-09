import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NameBreakdownRow } from '../../api/types';
import { formatCompact, formatFull, formatHours } from '../../format';
import { pokemonTypes, typeColor, typeLabel } from '../../pokemon';
import { ChartFrame, niceScale, tooltipBoxStyle } from './chartKit';

export type NameBreakdownMetric = 'avgProfitPerHour' | 'avgProfit' | 'avgRareKillsPerHour' | 'totalDurationSeconds';

interface NameBreakdownChartProps {
  data: NameBreakdownRow[];
  metricKey: NameBreakdownMetric;
  seriesLabel: string;
  unitLabel: string;
  formatValue?: (value: number) => string;
}

const ROW_HEIGHT = 34;

// Hours are plotted as hours (not seconds) so the axis gets whole-hour ticks
// instead of "5.6h | 11.1h" from round numbers of seconds.
const plotValue = (row: NameBreakdownRow, metricKey: NameBreakdownMetric) =>
  metricKey === 'totalDurationSeconds' ? row.totalDurationSeconds / 3600 : row[metricKey] ?? 0;

// Horizontal bars, one per hunt/MD name, so long names stay readable on the
// category axis and the ranking reads top-to-bottom. Each bar wears the color
// of its Pokémon's (first) type - always named in the legend and tooltip, never
// color alone; names that aren't a Pokémon fall back to a neutral gray. The
// tooltip carries the sample size (hours/runs) behind each average, since a
// spot done once for 15 minutes isn't as trustworthy as one farmed for 20 hours.
export function NameBreakdownChart({
  data,
  metricKey,
  seriesLabel,
  unitLabel,
  formatValue = formatCompact,
}: NameBreakdownChartProps) {
  if (data.length === 0) return <div className="chart-empty-state">Sem registros para o período selecionado.</div>;

  const isHours = metricKey === 'totalDurationSeconds';
  const rows = data.map((row) => {
    const type = pokemonTypes(row.name)[0] ?? null;
    return { ...row, plot: plotValue(row, metricKey), type, color: typeColor(type) };
  });
  const scale = niceScale(Math.max(0, ...rows.map((r) => r.plot)));
  const formatAxis = (v: number) => (isHours ? `${v}h` : formatValue(v));
  const formatBar = (row: (typeof rows)[number]) => (isHours ? formatHours(row.totalDurationSeconds) : formatValue(row.plot));
  const typesPresent = [...new Set(rows.map((r) => r.type))];

  const table = {
    columns: ['Nome', 'Tipo', seriesLabel, 'Horas caçadas', `${unitLabel[0].toUpperCase()}${unitLabel.slice(1)}s`],
    numericColumns: [2, 3, 4],
    rows: rows.map((r) => ({
      key: r.name,
      cells: [r.name, typeLabel(r.type), formatBar(r), formatHours(r.totalDurationSeconds), String(r.count)],
    })),
  };

  return (
    <ChartFrame caption={seriesLabel} table={table}>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * ROW_HEIGHT + 32)}>
        <BarChart data={rows} layout="vertical" accessibilityLayer margin={{ top: 8, right: 64, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" horizontal={false} />
          <XAxis
            type="number"
            dataKey="plot"
            domain={scale.domain}
            ticks={scale.ticks}
            tickFormatter={formatAxis}
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
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <div style={tooltipBoxStyle}>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                    {row.name} · {typeLabel(row.type)}
                  </div>
                  <div>
                    {seriesLabel}: <strong title={isHours ? undefined : formatFull(row.plot)}>{formatBar(row)}</strong>
                  </div>
                  {!isHours && (
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
          <Bar dataKey="plot" name={seriesLabel} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
            <LabelList
              dataKey="plot"
              position="right"
              formatter={(v: number) => (isHours ? formatHours(v * 3600) : formatValue(v))}
              style={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-marker-legend" aria-label="Cores por tipo">
        {typesPresent.map((type) => (
          <span key={type ?? 'unknown'}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: typeColor(type), display: 'inline-block' }} />
            {typeLabel(type)}
          </span>
        ))}
      </div>
    </ChartFrame>
  );
}
