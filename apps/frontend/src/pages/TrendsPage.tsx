import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import type { CompareResponse, TrendPoint } from '../api/types';
import { TrendChart } from '../components/charts/TrendChart';
import { DateRangePicker } from '../components/DateRangePicker';
import { StatTile } from '../components/StatTile';
import { formatCompact, formatInt } from '../format';
import { defaultPeriods } from '../dates';

const METRICS: { key: keyof TrendPoint; label: string; format: (v: number) => string }[] = [
  { key: 'avgProfitPerHour', label: 'Profit/h médio', format: formatCompact },
  { key: 'avgKillsPerHour', label: 'Kills/h médio', format: formatInt },
  { key: 'avgRareKillsPerHour', label: 'Raros/h médio', format: formatInt },
  { key: 'avgExperiencePerHour', label: 'Exp/h médio', format: formatCompact },
  { key: 'avgSuppliesPerHour', label: 'Suprimentos/h médio', format: formatCompact },
];

export function TrendsPage() {
  const { player, sessionType } = useFilters();
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('week');
  const [metricKey, setMetricKey] = useState<keyof TrendPoint>('avgProfitPerHour');
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  const initial = defaultPeriods();
  const [periodA, setPeriodA] = useState(initial.periodA);
  const [periodB, setPeriodB] = useState(initial.periodB);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    api.getTrends({ player, sessionType, bucket }).then(setTrend);
  }, [player, sessionType, bucket]);

  const metric = METRICS.find((m) => m.key === metricKey)!;

  async function runCompare() {
    setComparing(true);
    try {
      const res = await api.getCompare({ player, sessionType, periodA, periodB });
      setCompare(res);
    } finally {
      setComparing(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Tendências</h1>
      <p className="page-subtitle">Evolução das médias ao longo do tempo e comparação entre dois períodos.</p>

      <div className="section">
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={bucket} onChange={(e) => setBucket(e.target.value as any)}>
            <option value="day">Por dia</option>
            <option value="week">Por semana</option>
            <option value="month">Por mês</option>
          </select>
          <select value={metricKey} onChange={(e) => setMetricKey(e.target.value as keyof TrendPoint)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="card">
          <TrendChart data={trend} metricKey={metricKey} seriesLabel={metric.label} seriesColor="var(--series-1)" formatValue={metric.format} />
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">Comparar dois períodos</h2>
        <div className="card">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <DateRangePicker label="Período A" from={periodA.from} to={periodA.to} onChange={setPeriodA} />
            <DateRangePicker label="Período B" from={periodB.from} to={periodB.to} onChange={setPeriodB} />
            <div style={{ alignSelf: 'flex-end' }}>
              <button onClick={runCompare} disabled={comparing}>
                {comparing ? 'Comparando...' : 'Comparar'}
              </button>
            </div>
          </div>

          {compare && (
            <div className="two-col">
              <div>
                <div className="section-title" style={{ fontSize: 13 }}>
                  Período A ({compare.periodA.stats.huntCount} hunts)
                </div>
                <div className="stat-grid" style={{ marginBottom: 0 }}>
                  <StatTile label="Profit/h médio" value={formatCompact(compare.periodA.stats.avgProfitPerHour)} />
                  <StatTile label="Kills/h médio" value={formatInt(compare.periodA.stats.avgKillsPerHour)} />
                  <StatTile label="Raros/h médio" value={formatInt(compare.periodA.stats.avgRareKillsPerHour)} />
                  <StatTile label="Profit total" value={formatCompact(compare.periodA.stats.totalProfit)} />
                </div>
              </div>
              <div>
                <div className="section-title" style={{ fontSize: 13 }}>
                  Período B ({compare.periodB.stats.huntCount} hunts) — variação vs A
                </div>
                <div className="stat-grid" style={{ marginBottom: 0 }}>
                  <StatTile
                    label="Profit/h médio"
                    value={formatCompact(compare.periodB.stats.avgProfitPerHour)}
                    delta={compare.delta.avgProfitPerHour?.percent}
                  />
                  <StatTile
                    label="Kills/h médio"
                    value={formatInt(compare.periodB.stats.avgKillsPerHour)}
                    delta={compare.delta.avgKillsPerHour?.percent}
                  />
                  <StatTile
                    label="Raros/h médio"
                    value={formatInt(compare.periodB.stats.avgRareKillsPerHour)}
                    delta={compare.delta.avgRareKillsPerHour?.percent}
                  />
                  <StatTile
                    label="Profit total"
                    value={formatCompact(compare.periodB.stats.totalProfit)}
                    delta={compare.delta.totalProfit?.percent}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
