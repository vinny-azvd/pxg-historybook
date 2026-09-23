import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import type { HuntListItem, OverviewStats, PlayerTrendPoint, RareKillRow, TrendPoint } from '../api/types';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/charts/TrendChart';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import { PlayerLegend } from '../components/PlayerLegend';
import { HuntCard } from '../components/HuntCard';
import { formatBucketLabel, formatCompact, formatDateTime, formatHours, formatInt } from '../format';
import { bucketRange } from '../dates';

type Bucket = 'day' | 'week' | 'month' | 'hunt';

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'hunt', label: 'Por hunt' },
];

export function DashboardPage() {
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const { rareDropThreshold, getPlayerColor } = usePreferences();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [playerTrend, setPlayerTrend] = useState<PlayerTrendPoint[]>([]);
  const [bucket, setBucket] = useState<Bucket>('week');
  // A click on the chart drills the stat cards into that single point without
  // touching the chart's own (wider) range - otherwise the chart would be
  // left with just the one point it was just narrowed to, with nothing else
  // left to click. Resets whenever the broader filter/granularity changes,
  // since a specific day/week/month only makes sense relative to those.
  const [pointFilter, setPointFilter] = useState<{ from: string; to: string } | null>(null);
  const [dayTrend, setDayTrend] = useState<TrendPoint[]>([]);
  const [dayHunts, setDayHunts] = useState<HuntListItem[]>([]);
  const [dayHuntsLoading, setDayHuntsLoading] = useState(false);
  const [showRareKills, setShowRareKills] = useState(false);
  const [rareKills, setRareKills] = useState<RareKillRow[]>([]);
  const [rareKillsLoading, setRareKillsLoading] = useState(false);
  const drillDownRef = useRef<HTMLDivElement>(null);

  // No single character selected - color-code the main chart per player
  // instead of blending everyone into one averaged line. The per-hunt
  // granularity already colors its points by jade/rare-drop, so it keeps its
  // own single line rather than layering both signals into one chart.
  const showPlayerBreakdown = !player && bucket !== 'hunt';

  useEffect(() => {
    setPointFilter(null);
  }, [player, sessionType, from, to, bucket]);

  const overviewRange = pointFilter ?? { from, to };

  useEffect(() => {
    if (!showRareKills) return;
    let ignore = false;
    setRareKillsLoading(true);
    api
      .getRareKills({ player, sessionType, from: overviewRange.from, to: overviewRange.to })
      .then((res) => {
        if (!ignore) setRareKills(res);
      })
      .finally(() => {
        if (!ignore) setRareKillsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [showRareKills, player, sessionType, overviewRange.from, overviewRange.to]);

  // Requests can resolve out of order (e.g. picking "Este mês" then quickly
  // "Mês passado" - the first response can land after the second one and
  // silently overwrite it with stale data). `ignore` discards a response
  // that arrives after its own effect run has been superseded.
  useEffect(() => {
    let ignore = false;
    api.getOverview({ player, sessionType, from: overviewRange.from, to: overviewRange.to }).then((res) => {
      if (!ignore) setOverview(res);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, overviewRange.from, overviewRange.to]);

  useEffect(() => {
    let ignore = false;
    if (showPlayerBreakdown) {
      api.getTrendsByPlayer({ player, sessionType, from, to, bucket }).then((res) => {
        if (!ignore) setPlayerTrend(res);
      });
    } else {
      api.getTrends({ player, sessionType, from, to, bucket }).then((res) => {
        if (!ignore) setTrend(res);
      });
    }
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, bucket, showPlayerBreakdown]);

  const playerSeries = useMemo(() => {
    const byPlayer = new Map<number, { playerId: number; playerName: string; points: PlayerTrendPoint[] }>();
    for (const row of playerTrend) {
      const existing = byPlayer.get(row.playerId);
      if (existing) existing.points.push(row);
      else byPlayer.set(row.playerId, { playerId: row.playerId, playerName: row.playerName, points: [row] });
    }
    return [...byPlayer.values()]
      .sort((a, b) => a.playerId - b.playerId)
      .map((entry, index) => ({ ...entry, color: getPlayerColor(String(entry.playerId), index) }));
  }, [playerTrend, getPlayerColor]);

  // Drilling into a clicked point also breaks it down hunt-by-hunt: how many
  // hunts happened that day/week/month, each with its own jade/rare-drop
  // indicator, instead of just the narrowed averages in the stat tiles above.
  useEffect(() => {
    if (!pointFilter) {
      setDayTrend([]);
      setDayHunts([]);
      return;
    }
    let ignore = false;
    setDayHuntsLoading(true);
    Promise.all([
      api.getTrends({ player, sessionType, from: pointFilter.from, to: pointFilter.to, bucket: 'hunt' }),
      api.getHunts({
        player,
        sessionType,
        from: pointFilter.from,
        to: pointFilter.to,
        sort: 'start_time',
        order: 'asc',
        page: 1,
        pageSize: 100,
      }),
    ])
      .then(([trendRes, huntsRes]) => {
        if (ignore) return;
        setDayTrend(trendRes);
        setDayHunts(huntsRes.items);
        // Scroll only once the drilled-down content (chart + hunt cards) has
        // actually rendered at full height - scrolling right when the click
        // happens targets the still-collapsed "Carregando..." placeholder
        // and stops short of where the real content ends up.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            drillDownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      })
      .finally(() => {
        if (!ignore) setDayHuntsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, pointFilter?.from, pointFilter?.to]);

  function handlePointClick(bucketStart: string) {
    if (bucket === 'hunt') return;
    const range = bucketRange(bucketStart, bucket);
    setPointFilter((prev) => (prev && prev.from === range.from && prev.to === range.to ? null : range));
  }

  const knownBucketStarts = showPlayerBreakdown ? playerTrend.map((p) => p.bucketStart) : trend.map((p) => p.bucketStart);
  const selectedBucketStart = pointFilter && bucket !== 'hunt'
    ? knownBucketStarts.find((bucketStart) => {
        const range = bucketRange(bucketStart, bucket);
        return range.from === pointFilter.from && range.to === pointFilter.to;
      })
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
        <StatTile label="Horas caçadas" value={formatHours(overview.totalDurationSeconds)} />
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
        <StatTile
          label="Raros total"
          value={formatInt(overview.totalRareKills)}
          onClick={() => setShowRareKills((v) => !v)}
        />
        <StatTile
          label="Raros/h médio"
          value={formatInt(overview.avgRareKillsPerHour)}
          sub={`máx ${formatInt(overview.maxRareKillsPerHour)}/h · recorde ${formatInt(overview.maxRareKills)} numa hunt`}
        />
        <StatTile label="Exp/h médio" value={formatCompact(overview.avgExperiencePerHour)} />
        <StatTile label="Suprimentos/h médio" value={formatCompact(overview.avgSuppliesPerHour)} />
      </div>

      {showRareKills && (
        <div className="section">
          <h2 className="section-title">Raros mortos no período ({rareKills.length})</h2>
          <div className="card">
            {rareKillsLoading ? (
              <div className="empty-state">Carregando...</div>
            ) : rareKills.length === 0 ? (
              <div className="empty-state">Nenhum raro no período selecionado.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Hunt</th>
                    <th>Data</th>
                    <th>Inimigo</th>
                    <th>Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {rareKills.map((rk) => (
                    <tr key={rk.id}>
                      <td>
                        <Link to={`/hunts/${rk.huntId}`}>{rk.huntName ?? 'Hunt'}</Link>
                      </td>
                      <td>{formatDateTime(rk.startTime)}</td>
                      <td>
                        {rk.enemy}
                        {rk.fromNightmareCrystal && (
                          <>
                            {' '}
                            <span className="badge badge-jade" title="Spawn aleatório do Nightmare Crystal">
                              via Nightmare Crystal
                            </span>
                          </>
                        )}
                      </td>
                      <td>{formatInt(rk.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {(overview.mostProfitableHunt || overview.leastProfitableHunt || overview.mostFrequentHunt) && (
        <div className="highlight-grid section" style={{ marginBottom: 24 }}>
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
          {overview.leastProfitableHunt && (
            <div className="card">
              <h2 className="section-title">Hunt menos lucrativa</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                <Link to={`/hunts/${overview.leastProfitableHunt.id}`}>
                  {overview.leastProfitableHunt.huntName ?? 'Hunt'}
                </Link>{' '}
                em {formatDateTime(overview.leastProfitableHunt.startTime)} — profit de{' '}
                {formatCompact(overview.leastProfitableHunt.profit)} (
                {formatCompact(overview.leastProfitableHunt.profitPerHour)}/h)
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
            Profit/h por{' '}
            {bucket === 'day' ? 'dia' : bucket === 'week' ? 'semana' : bucket === 'month' ? 'mês' : 'hunt'}
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
          {showPlayerBreakdown ? (
            <>
              <PlayerLegend entries={playerSeries.map((s) => ({ id: s.playerId, name: s.playerName, color: s.color }))} />
              <MultiSeriesTrendChart
                series={playerSeries}
                bucket={bucket as 'day' | 'week' | 'month'}
                onPointClick={handlePointClick}
                selectedBucketStart={selectedBucketStart}
              />
            </>
          ) : (
            <TrendChart
              data={trend}
              metricKey="avgProfitPerHour"
              seriesLabel={bucket === 'hunt' ? 'Profit/h' : 'Profit/h médio'}
              seriesColor="var(--series-1)"
              bucket={bucket}
              onPointClick={bucket === 'hunt' ? undefined : handlePointClick}
              selectedBucketStart={selectedBucketStart}
              rareDropThreshold={rareDropThreshold}
            />
          )}
        </div>
      </div>

      {pointFilter && (
        <div className="section" ref={drillDownRef} style={{ scrollMarginTop: 96 }}>
          <h2 className="section-title">
            Hunts em {selectedBucketStart ? formatBucketLabel(selectedBucketStart, bucket) : ''}
            {!dayHuntsLoading && <> ({dayHunts.length})</>}
          </h2>
          {dayHuntsLoading ? (
            <div className="empty-state">Carregando...</div>
          ) : dayHunts.length === 0 ? (
            <div className="empty-state">Nenhuma hunt nesse período.</div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <TrendChart
                  data={dayTrend}
                  metricKey="avgProfitPerHour"
                  seriesLabel="Profit/h"
                  seriesColor="var(--series-1)"
                  bucket="hunt"
                  rareDropThreshold={rareDropThreshold}
                />
              </div>
              <div className="hunt-card-grid">
                {dayHunts.map((hunt) => (
                  <HuntCard key={hunt.id} hunt={hunt} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
