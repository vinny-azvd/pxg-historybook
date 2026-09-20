import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import type { OverviewStats, TrendPoint } from '../api/types';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/charts/TrendChart';
import { formatCompact, formatDateTime, formatInt } from '../format';

const BUCKET_OPTIONS: { value: 'day' | 'week' | 'month'; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

export function DashboardPage() {
  const { player, sessionType, from, to } = useFilters();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('week');

  useEffect(() => {
    api.getOverview({ player, sessionType, from, to }).then(setOverview);
  }, [player, sessionType, from, to]);

  useEffect(() => {
    api.getTrends({ player, sessionType, from, to, bucket }).then(setTrend);
  }, [player, sessionType, from, to, bucket]);

  if (!overview) return <div className="empty-state">Carregando...</div>;

  if (overview.huntCount === 0) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <div className="empty-state">
          Nenhuma hunt registrada ainda. <Link to="/upload">Importe sua primeira hunt</Link> para começar a ver os
          dashboards.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        {overview.huntCount} hunt{overview.huntCount === 1 ? '' : 's'} no período selecionado.
      </p>

      <div className="stat-grid">
        <StatTile label="Profit total" value={formatCompact(overview.totalProfit)} />
        <StatTile
          label="Profit/h médio"
          value={formatCompact(overview.avgProfitPerHour)}
          sub={`máx ${formatCompact(overview.maxProfitPerHour)}`}
        />
        <StatTile label="Kills total" value={formatInt(overview.totalKills)} />
        <StatTile
          label="Kills/h médio"
          value={formatInt(overview.avgKillsPerHour)}
          sub={`máx ${formatInt(overview.maxKillsPerHour)}/h · recorde ${formatInt(overview.maxKills)} numa hunt`}
        />
        <StatTile label="Raros total" value={formatInt(overview.totalRareKills)} />
        <StatTile
          label="Raros/h médio"
          value={formatInt(overview.avgRareKillsPerHour)}
          sub={`máx ${formatInt(overview.maxRareKillsPerHour)}/h · recorde ${formatInt(overview.maxRareKills)} numa hunt`}
        />
        <StatTile label="Exp/h médio" value={formatCompact(overview.avgExperiencePerHour)} />
        <StatTile label="Suprimentos/h médio" value={formatCompact(overview.avgSuppliesPerHour)} />
      </div>

      {(overview.mostProfitableHunt || overview.mostFrequentHunt) && (
        <div className="two-col section" style={{ marginBottom: 24 }}>
          {overview.mostProfitableHunt && (
            <div className="card">
              <h2 className="section-title">Hunt mais lucrativa</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                <Link to={`/hunts/${overview.mostProfitableHunt.id}`}>
                  {overview.mostProfitableHunt.huntName ?? 'Hunt'}
                </Link>{' '}
                em {formatDateTime(overview.mostProfitableHunt.startTime)} — profit de{' '}
                {formatCompact(overview.mostProfitableHunt.profit)} (
                {formatCompact(overview.mostProfitableHunt.profitPerHour)}/h)
              </p>
            </div>
          )}
          {overview.mostFrequentHunt && (
            <div className="card">
              <h2 className="section-title">Hunt mais feita</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>{overview.mostFrequentHunt.huntName}</strong> — {overview.mostFrequentHunt.count} hunt
                {overview.mostFrequentHunt.count === 1 ? '' : 's'} registrada
                {overview.mostFrequentHunt.count === 1 ? '' : 's'} no período
              </p>
            </div>
          )}
        </div>
      )}

      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Profit/h por {bucket === 'day' ? 'dia' : bucket === 'week' ? 'semana' : 'mês'}
          </h2>
          <div className="bucket-toggle">
            {BUCKET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={bucket === opt.value ? '' : 'secondary'}
                onClick={() => setBucket(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <TrendChart
            data={trend}
            metricKey="avgProfitPerHour"
            seriesLabel="Profit/h médio"
            seriesColor="var(--series-1)"
            bucket={bucket}
          />
        </div>
      </div>
    </div>
  );
}
