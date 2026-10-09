import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { usePlayerColor } from '../playerColors';
import { parseHuntJson } from '../jsonParse';
import { ConfirmHuntModal } from '../components/ConfirmHuntModal';
import { HuntCard } from '../components/HuntCard';
import { CardSettingsPanel } from '../components/CardSettingsPanel';
import { BattleScene } from '../components/themes/BattleScene';
import { StatTile } from '../components/StatTile';
import { PeriodNavigator } from '../components/PeriodNavigator';
import { TrendChart } from '../components/charts/TrendChart';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import { NameBreakdownChart, type NameBreakdownMetric } from '../components/charts/NameBreakdownChart';
import { PlayerLegend } from '../components/PlayerLegend';
import { PeriodCards } from '../components/themes/PeriodCards';
import { ScopeBreadcrumb, ScopeToolbar, bucketNoun, useChartScope } from '../chartScope';
import type { HuntListItem, NameBreakdownRow, OverviewStats, PlayerTrendPoint, RareKillRow, TrendPoint } from '../api/types';
import { formatCompact, formatDateTime, formatHours, formatInt, formatRate } from '../format';
import { inferPeriodScope, periodRangeForDate, type PeriodScope } from '../dates';

type Tab = 'dashboard' | 'history' | 'upload';
type NameRange = PeriodScope;

const NAME_RANGE_OPTIONS: { value: NameRange; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'custom', label: 'Personalizado' },
];

type HuntNameMetric = Extract<NameBreakdownMetric, 'avgProfitPerHour' | 'avgRareKillsPerHour' | 'totalDurationSeconds'>;

const NAME_METRIC_OPTIONS: {
  value: HuntNameMetric;
  label: string;
  title: string;
  formatValue: (value: number) => string;
}[] = [
  { value: 'avgProfitPerHour', label: 'Profit/h médio', title: 'Profit/h médio por hunt', formatValue: formatCompact },
  { value: 'avgRareKillsPerHour', label: 'Raros/h médio', title: 'Raros/h médio por hunt', formatValue: formatRate },
  { value: 'totalDurationSeconds', label: 'Horas caçadas', title: 'Horas caçadas por hunt', formatValue: formatHours },
];

// Reserves room for 2 lines so the highlight cards don't change height
// depending on whether their text wraps (a long hunt name/date) or is a
// short one-liner (the "Sem hunts no período" placeholder) - that height
// change was shoving the chart section (and its nav buttons) around.
const highlightTextStyle: CSSProperties = { margin: 0, fontSize: 14, minHeight: 40, lineHeight: '20px' };

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'start_time', label: 'Data' },
  { key: 'hunt_name', label: 'Hunt' },
  { key: 'duration_seconds', label: 'Duração' },
  { key: 'profit', label: 'Profit' },
  { key: 'profit_per_hour', label: 'Profit/h' },
  { key: 'kills_per_hour', label: 'Kills/h' },
  { key: 'rare_kills_per_hour', label: 'Raros/h' },
];

export function HuntPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div>
      <h1 className="page-title">Hunts</h1>
      <div className="bucket-toggle" style={{ marginBottom: 16 }}>
        <button className={tab === 'dashboard' ? '' : 'secondary'} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button className={tab === 'history' ? '' : 'secondary'} onClick={() => setTab('history')}>
          Histórico
        </button>
        <button className={tab === 'upload' ? '' : 'secondary'} onClick={() => setTab('upload')}>
          Importar hunt
        </button>
      </div>

      {tab === 'dashboard' && <HuntDashboardTab />}
      {tab === 'history' && <HuntHistoryTab />}
      {tab === 'upload' && <HuntUploadTab onImported={() => setTab('history')} />}
    </div>
  );
}

function HuntDashboardTab() {
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const { rareDropThreshold } = usePreferences();
  const getPlayerColor = usePlayerColor();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  // Unaffected by the from/to period filter, unlike `overview` - so
  // navigating to a period with zero hunts (e.g. an empty week) doesn't get
  // mistaken for "nothing imported yet" and blank out the whole page.
  const [totalHuntCount, setTotalHuntCount] = useState<number | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [playerTrend, setPlayerTrend] = useState<PlayerTrendPoint[]>([]);
  // The bucket and range the loaded trend rows are for: a granularity switch or
  // a step with the arrows must not plot the old rows under the new axis labels.
  const [trendBucket, setTrendBucket] = useState<string | null>(null);
  const [byName, setByName] = useState<NameBreakdownRow[]>([]);
  const [nameMetric, setNameMetric] = useState<HuntNameMetric>('avgProfitPerHour');
  // "Personalizado" can line up with a whole day/week/month by coincidence
  // while the user is still typing dates - keep the inputs open regardless.
  const [nameRangeCustomOpen, setNameRangeCustomOpen] = useState(false);
  // The chart is either a comparison over time (granularity, zoom: see
  // chartScope) or the ranking by hunt name ("Por hunt").
  const [view, setView] = useState<'time' | 'name'>('time');
  const scope = useChartScope({ entryBucket: 'hunt' });
  const [showRareKills, setShowRareKills] = useState(false);
  const [rareKills, setRareKills] = useState<RareKillRow[]>([]);
  const [rareKillsLoading, setRareKillsLoading] = useState(false);

  // No single character selected - color-code the main chart per player
  // instead of blending everyone into one averaged line. Zoomed down to single
  // hunts the points are colored by jade/rare-drop, so that level keeps its
  // own single line rather than layering both signals into one chart.
  const showNameBreakdown = view === 'name';
  const chartBucket = scope.chartBucket as 'day' | 'week' | 'month' | 'hunt';
  const showPlayerBreakdown = !player && !showNameBreakdown && !scope.isEntryLevel;

  // "Por hunt" isn't a time axis at all - it groups by hunt name (Sudowoodo,
  // Raichu, ...) across whatever the period filter is, comparing each spot's
  // average against the others.

  useEffect(() => {
    if (!from && !to) setNameRangeCustomOpen(false);
  }, [from, to]);

  const overviewRange = { from, to };

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
    api.getOverview({ player, sessionType }).then((res) => {
      if (!ignore) setTotalHuntCount(res.huntCount);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType]);

  useEffect(() => {
    let ignore = false;
    if (showNameBreakdown) {
      api.getByName({ player, sessionType, from, to }).then((res) => {
        if (!ignore) setByName(res);
      });
    } else if (showPlayerBreakdown) {
      api.getTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (ignore) return;
        setPlayerTrend(res);
        setTrendBucket(`player:${chartBucket}:${from}:${to}`);
      });
    } else {
      api.getTrends({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (ignore) return;
        setTrend(res);
        setTrendBucket(`single:${chartBucket}:${from}:${to}`);
      });
    }
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, chartBucket, showPlayerBreakdown, showNameBreakdown]);

  const trendReady = trendBucket === `${showPlayerBreakdown ? 'player' : 'single'}:${chartBucket}:${from}:${to}`;
  const nameRange: NameRange = nameRangeCustomOpen ? 'custom' : inferPeriodScope(from, to);
  const nameMetricOption = NAME_METRIC_OPTIONS.find((opt) => opt.value === nameMetric)!;
  const sortedByName = useMemo(
    () => [...byName].sort((a, b) => (b[nameMetric] ?? -Infinity) - (a[nameMetric] ?? -Infinity)),
    [byName, nameMetric]
  );

  function selectNameRange(next: NameRange) {
    setNameRangeCustomOpen(next === 'custom');
    if (next === 'all') setDateRange({ from: '', to: '' });
    else if (next !== 'custom') setDateRange(periodRangeForDate(new Date(), next));
  }

  const playerSeries = useMemo(() => {
    const byPlayer = new Map<number, { playerId: number; playerName: string; points: PlayerTrendPoint[] }>();
    for (const row of playerTrend) {
      const existing = byPlayer.get(row.playerId);
      if (existing) existing.points.push(row);
      else byPlayer.set(row.playerId, { playerId: row.playerId, playerName: row.playerName, points: [row] });
    }
    return [...byPlayer.values()]
      .sort((a, b) => a.playerId - b.playerId)
      .map((entry) => ({ ...entry, color: getPlayerColor(entry.playerId) }));
  }, [playerTrend, getPlayerColor]);

  if (!overview || totalHuntCount === null) return <div className="empty-state">Carregando...</div>;

  if (totalHuntCount === 0) {
    return (
      <div className="empty-state">
        Nenhuma hunt registrada ainda. Use a aba "Importar hunt" para começar a ver os dashboards.
      </div>
    );
  }

  return (
    <div>
      <BattleScene overview={overview} />
      <p className="page-subtitle">
        {overview.huntCount} hunt{overview.huntCount === 1 ? '' : 's'} no período selecionado.
        {(from || to) && (
          <>
            {' '}
            <button
              className="secondary"
              style={{ fontSize: 11.5, padding: '2px 8px', marginLeft: 4 }}
              onClick={() => scope.setGranularity('all')}
            >
              Ver todo o período
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
          sub={showRareKills ? 'clique para ocultar a lista' : 'clique para listar os raros'}
          onClick={() => setShowRareKills((v) => !v)}
        />
        <StatTile
          label="Raros/h médio"
          value={formatRate(overview.avgRareKillsPerHour)}
          sub={`máx ${formatRate(overview.maxRareKillsPerHour)}/h · recorde ${formatInt(overview.maxRareKills)} numa hunt`}
        />
        <StatTile label="Exp/h médio" value={formatCompact(overview.avgExperiencePerHour)} />
        <StatTile label="Suprimentos/h médio" value={formatCompact(overview.avgSuppliesPerHour)} />
      </div>

      {showRareKills && (
        <div className="section">
          {/* The quick inline list stays; the full breakdown (species,
              rates, timeline) lives on its own page, same period. */}
          <div className="rares-inline-header">
            <h2 className="section-title" style={{ margin: 0 }}>
              Raros mortos no período <span className="num">({rareKills.length})</span>
            </h2>
            {/* Opens on Hunts only, so the total there matches this tile's. */}
            <Link to="/raros?origin=hunt" className="muted-link">
              Ver página Raros →
            </Link>
          </div>
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

      {/* Always rendered, even with placeholders, so navigating to an empty
          period doesn't collapse this block and shove the rest of the page
          up - only the text inside changes, not the layout around it. */}
      <div className="highlight-grid section" style={{ marginBottom: 24 }}>
        <div className="card">
          <h2 className="section-title">Hunt mais lucrativa</h2>
          {overview.mostProfitableHunt ? (
            <p style={highlightTextStyle}>
              <Link to={`/hunts/${overview.mostProfitableHunt.id}`}>
                {overview.mostProfitableHunt.huntName ?? 'Hunt'}
              </Link>{' '}
              ({overview.mostProfitableHunt.players.join(', ') || '—'}) em{' '}
              {formatDateTime(overview.mostProfitableHunt.startTime)} — profit de{' '}
              {formatCompact(overview.mostProfitableHunt.profit)} (
              {formatCompact(overview.mostProfitableHunt.profitPerHour)}/h)
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem hunts no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">Hunt menos lucrativa</h2>
          {overview.leastProfitableHunt ? (
            <p style={highlightTextStyle}>
              <Link to={`/hunts/${overview.leastProfitableHunt.id}`}>
                {overview.leastProfitableHunt.huntName ?? 'Hunt'}
              </Link>{' '}
              ({overview.leastProfitableHunt.players.join(', ') || '—'}) em{' '}
              {formatDateTime(overview.leastProfitableHunt.startTime)} — profit de{' '}
              {formatCompact(overview.leastProfitableHunt.profit)} (
              {formatCompact(overview.leastProfitableHunt.profitPerHour)}/h)
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem hunts no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">Hunt mais feita</h2>
          {overview.mostFrequentHunt ? (
            <p style={highlightTextStyle}>
              <strong>{overview.mostFrequentHunt.huntName}</strong> — {overview.mostFrequentHunt.count} hunt
              {overview.mostFrequentHunt.count === 1 ? '' : 's'} registrada
              {overview.mostFrequentHunt.count === 1 ? '' : 's'} no período
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem hunts no período.</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="scope-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            {showNameBreakdown ? nameMetricOption.title : `Profit/h por ${bucketNoun(chartBucket, 'hunt')}`}
          </h2>
          <ScopeToolbar
            scope={scope}
            onGranularity={(granularity) => {
              setView('time');
              scope.setGranularity(granularity);
            }}
            extra={{
              label: 'Por hunt',
              title: 'Ranking por nome de hunt no período',
              active: showNameBreakdown,
              onSelect: () => {
                setView('name');
                setNameRangeCustomOpen(false);
              },
            }}
          />
        </div>
        {!showNameBreakdown && <ScopeBreadcrumb scope={scope} />}
        {showNameBreakdown && (
          <div className="chart-toolbar">
            <div className="chart-toolbar-group">
              <span className="chart-toolbar-label">Período</span>
              <div className="bucket-toggle">
                {NAME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={nameRange === opt.value ? '' : 'secondary'}
                    onClick={() => selectNameRange(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {(nameRange === 'day' || nameRange === 'week' || nameRange === 'month') && (
                <PeriodNavigator bucket={nameRange} />
              )}
              {nameRange === 'custom' && (
                <div className="period-nav">
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setDateRange({ from: e.target.value, to })}
                    aria-label="Data inicial"
                  />
                  <span style={{ color: 'var(--text-muted)' }}>até</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setDateRange({ from, to: e.target.value })}
                    aria-label="Data final"
                  />
                </div>
              )}
            </div>
            <div className="chart-toolbar-group">
              <span className="chart-toolbar-label">Métrica</span>
              <div className="bucket-toggle">
                {NAME_METRIC_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={nameMetric === opt.value ? '' : 'secondary'}
                    onClick={() => setNameMetric(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="card">
          {showNameBreakdown ? (
            <NameBreakdownChart
              data={sortedByName}
              metricKey={nameMetric}
              seriesLabel={nameMetricOption.label}
              unitLabel="hunt"
              formatValue={nameMetricOption.formatValue}
            />
          ) : !trendReady ? (
            <div className="chart-empty-state">Carregando...</div>
          ) : showPlayerBreakdown ? (
            <>
              <PlayerLegend entries={playerSeries.map((s) => ({ id: s.playerId, name: s.playerName, color: s.color }))} />
              <MultiSeriesTrendChart
                rareDropThreshold={rareDropThreshold}
                series={playerSeries}
                bucket={chartBucket}
                range={scope.range}
                onZoom={scope.canZoom ? scope.zoom : undefined}
                onZoomSpan={scope.canZoom ? scope.zoomSpan : undefined}
              />
            </>
          ) : (
            <TrendChart
              data={trend}
              metricKey="avgProfitPerHour"
              seriesLabel={chartBucket === 'hunt' ? 'Profit/h' : 'Profit/h médio'}
              seriesColor="var(--series-1)"
              bucket={chartBucket}
              range={scope.range}
              onZoom={scope.canZoom ? scope.zoom : undefined}
              onZoomSpan={scope.canZoom ? scope.zoomSpan : undefined}
              rareDropThreshold={rareDropThreshold}
            />
          )}
        </div>
      </div>

      <PeriodCards kind="hunt" entryLevel={!showNameBreakdown && scope.isEntryLevel} periodLabel={scope.label} />
    </div>
  );
}

function HuntHistoryTab() {
  const { player, sessionType, from, to } = useFilters();
  const [items, setItems] = useState<HuntListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('start_time');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  useEffect(() => {
    setLoading(true);
    api
      .getHunts({ player, sessionType, from, to, sort, order, page, pageSize })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [player, sessionType, from, to, sort, order, page]);

  useEffect(() => setPage(1), [player, sessionType, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <p className="page-subtitle">
            {total} hunt{total === 1 ? '' : 's'} registrada{total === 1 ? '' : 's'}. Clique num card para ver os
            raros e drops raros dessa hunt.
          </p>
        </div>
        <CardSettingsPanel />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label htmlFor="sort-select" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Ordenar por
        </label>
        <select id="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}>
          {order === 'asc' ? '▲ Asc' : '▼ Desc'}
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhuma hunt encontrada. Use a aba "Importar hunt" para começar.</div>
      ) : (
        <div className="hunt-card-grid">
          {items.map((hunt) => (
            <HuntCard key={hunt.id} hunt={hunt} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Página {page} de {totalPages}
          </span>
          <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

type UploadStatus =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'duplicate'; huntId: number }
  | { kind: 'success'; huntId: number; players: string[]; huntName: string | null };

function HuntUploadTab({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: 'idle' });
  const [pendingHunt, setPendingHunt] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const { refreshPlayers } = useFilters();

  function parseAndPreview(raw: string) {
    setStatus({ kind: 'idle' });
    const parsed = parseHuntJson(raw);
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.message! });
      return;
    }
    setModalError(null);
    setPendingHunt(parsed.data);
  }

  async function confirmUpload(huntName: string, nightmareCrystalSelections: string[]) {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await api.uploadHunt({ hunt: pendingHunt, huntName, nightmareCrystalSelections });
      if (res.status === 409) {
        setPendingHunt(null);
        setStatus({ kind: 'duplicate', huntId: res.body.existingHuntId });
      } else if (!res.ok) {
        const issues = res.body.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n');
        setModalError(issues || res.body.error || 'Falha ao importar a hunt.');
      } else {
        setPendingHunt(null);
        setStatus({ kind: 'success', huntId: res.body.id, players: res.body.players, huntName: res.body.huntName });
        setText('');
        refreshPlayers();
        onImported();
      }
    } catch (err) {
      setModalError(`Falha ao enviar a hunt para o servidor: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    file.text().then((content) => {
      setText(content);
      parseAndPreview(content);
    });
  }

  return (
    <div>
      <p className="page-subtitle">Cole o JSON exportado do analyzer ou arraste o arquivo .json aqui.</p>

      {status.kind === 'error' && <div className="error-box">{status.message}</div>}
      {status.kind === 'duplicate' && (
        <div className="error-box">
          Essa hunt já foi importada antes. <Link to={`/hunts/${status.huntId}`}>Ver hunt existente</Link>
        </div>
      )}
      {status.kind === 'success' && (
        <div className="success-box">
          Hunt {status.huntName ? `de ${status.huntName} ` : ''}importada com sucesso ({status.players.join(', ')}).{' '}
          <Link to={`/hunts/${status.huntId}`}>Ver detalhes</Link>
        </div>
      )}

      <div
        className={`upload-drop ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        Arraste o arquivo .json da hunt aqui
      </div>

      <textarea
        rows={16}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }}
        placeholder="Cole aqui o JSON exportado da hunt..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button disabled={!text.trim()} onClick={() => parseAndPreview(text)}>
          Importar hunt
        </button>
      </div>

      {pendingHunt && (
        <ConfirmHuntModal
          hunt={pendingHunt}
          submitting={submitting}
          errorMessage={modalError}
          onConfirm={confirmUpload}
          onCancel={() => {
            setPendingHunt(null);
            setModalError(null);
          }}
        />
      )}
    </div>
  );
}
