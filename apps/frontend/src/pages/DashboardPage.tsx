import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import type { OverviewStats, TrendPoint } from '../api/types';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/charts/TrendChart';
import { formatBucketLabel, formatCompact, formatDateTime, formatInt } from '../format';
import { bucketRange } from '../dates';

const BUCKET_OPTIONS: { value: 'day' | 'week' | 'month'; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

export function DashboardPage() {
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('week');
  // A click on the chart drills the stat cards into that single point without
  // touching the chart's own (wider) range - otherwise the chart would be
  // left with just the one point it was just narrowed to, with nothing else
  // left to click. Resets whenever the broader filter/granularity changes,
  // since a specific day/week/month only makes sense relative to those.
  const [pointFilter, setPointFilter] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    setPointFilter(null);
  }, [player, sessionType, from, to, bucket]);

  const overviewRange = pointFilter ?? { from, to };

  useEffect(() => {
    api.getOverview({ player, sessionType, from: overviewRange.from, to: overviewRange.to }).then(setOverview);
  }, [player, sessionType, overviewRange.from, overviewRange.to]);

  useEffect(() => {
    api.getTrends({ player, sessionType, from, to, bucket }).then(setTrend);
  }, [player, sessionType, from, to, bucket]);

  function handlePointClick(bucketStart: string) {
    const range = bucketRange(bucketStart, bucket);
    setPointFilter((prev) => (prev && prev.from === range.from && prev.to === range.to ? null : range));
  }

  const selectedBucketStart = pointFilter
    ? trend.find((p) => {
        const range = bucketRange(p.bucketStart, bucket);
        return range.from === pointFilter.from && range.to === pointFilter.to;
      })?.bucketStart
    : undefined;

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
        {pointFilter && selectedBucketStart && <> · {formatBucketLabel(selectedBucketStart, bucket)}</>}
        {(pointFilter || from || to) && (
          <>
            {' '}
            <button
              className="secondary"
              style={{ fontSize: 11.5, padding: '2px 8px', marginLeft: 4 }}
              onClick={() => (pointFilter ? setPointFilter(null) : setDateRange({ from: '', to: '' }))}
            >
              {pointFilter ? 'Voltar ao período completo' : 'Limpar filtro de período'}
            </button>
          </>
        )}
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
            onPointClick={handlePointClick}
            selectedBucketStart={selectedBucketStart}
          />
        </div>
      </div>
    </div>
  );
}
