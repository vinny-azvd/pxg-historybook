import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import type { OverviewStats, TrendPoint } from '../api/types';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/charts/TrendChart';
import { formatCompact, formatDateTime, formatInt } from '../format';

export function DashboardPage() {
  const { player, sessionType } = useFilters();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    api.getOverview({ player, sessionType }).then(setOverview);
    api.getTrends({ player, sessionType, bucket: 'week' }).then(setTrend);
  }, [player, sessionType]);

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
      <p className="page-subtitle">{overview.huntCount} hunts no período selecionado.</p>

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
          sub={`máx ${formatInt(overview.maxKillsPerHour)} · recorde ${formatInt(overview.maxKills)}`}
        />
        <StatTile label="Raros total" value={formatInt(overview.totalRareKills)} />
        <StatTile
          label="Raros/h médio"
          value={formatInt(overview.avgRareKillsPerHour)}
          sub={`máx ${formatInt(overview.maxRareKillsPerHour)} · recorde ${formatInt(overview.maxRareKills)}`}
        />
        <StatTile label="Exp/h médio" value={formatCompact(overview.avgExperiencePerHour)} />
        <StatTile label="Suprimentos/h médio" value={formatCompact(overview.avgSuppliesPerHour)} />
      </div>

      {overview.mostProfitableHunt && (
        <div className="card section" style={{ marginBottom: 24 }}>
          <h2 className="section-title">Hunt mais lucrativa</h2>
          <p style={{ margin: 0, fontSize: 14 }}>
            <Link to={`/hunts/${overview.mostProfitableHunt.id}`}>
              {formatDateTime(overview.mostProfitableHunt.startTime)}
            </Link>{' '}
            — profit de {formatCompact(overview.mostProfitableHunt.profit)} (
            {formatCompact(overview.mostProfitableHunt.profitPerHour)}/h)
          </p>
        </div>
      )}

      <div className="section">
        <h2 className="section-title">Profit/h por semana</h2>
        <div className="card">
          <TrendChart data={trend} metricKey="avgProfitPerHour" seriesLabel="Profit/h médio" seriesColor="var(--series-1)" />
        </div>
      </div>
    </div>
  );
}
