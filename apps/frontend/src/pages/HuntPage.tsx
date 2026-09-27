import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { parseHuntJson } from '../jsonParse';
import { ConfirmHuntModal } from '../components/ConfirmHuntModal';
import { HuntCard } from '../components/HuntCard';
import { CardSettingsPanel } from '../components/CardSettingsPanel';
import { StatTile } from '../components/StatTile';
import { PeriodNavigator } from '../components/PeriodNavigator';
import { TrendChart } from '../components/charts/TrendChart';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import { PlayerLegend } from '../components/PlayerLegend';
import type { HuntListItem, OverviewStats, PlayerTrendPoint, RareKillRow, TrendPoint } from '../api/types';
import { formatBucketLabel, formatCompact, formatDateTime, formatHours, formatInt } from '../format';
import { bucketRange, periodRangeForDate } from '../dates';

type Tab = 'dashboard' | 'history' | 'upload';
type Bucket = 'day' | 'week' | 'month' | 'hunt';

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'hunt', label: 'Por hunt' },
];

const CHART_BUCKET_LABEL: Record<Bucket, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mês',
  hunt: 'hunt',
};

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
  const { rareDropThreshold, getPlayerColor } = usePreferences();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  // Unaffected by the from/to period filter, unlike `overview` - so
  // navigating to a period with zero hunts (e.g. an empty week) doesn't get
  // mistaken for "nothing imported yet" and blank out the whole page.
  const [totalHuntCount, setTotalHuntCount] = useState<number | null>(null);
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

  // The bucket toggle picks which single period you're browsing (a day, a
  // week, a month), but the chart itself always drills one level finer than
  // that: a week shows its days, a month shows its weeks, a day shows its
  // individual hunts. "Por hunt" has no coarser period around it, so it just
  // shows hunts across whatever the outer date filter is.
  const chartBucket: Bucket = bucket === 'day' ? 'hunt' : bucket === 'week' ? 'day' : bucket === 'month' ? 'week' : 'hunt';

  // Switching the bucket toggle pins the outer date filter to a single
  // concrete day/week/month (defaulting to whichever one is already in view,
  // or today) - otherwise "Semana" over an unrestricted "Todo o período"
  // filter would still show every week ever recorded instead of just one.
  function selectBucket(next: Bucket) {
    setBucket(next);
    if (next === 'hunt') return;
    const referenceIso = to || from;
    const referenceDate = referenceIso ? new Date(`${referenceIso}T00:00:00`) : new Date();
    setDateRange(periodRangeForDate(referenceDate, next));
  }

  // Same pinning, but only for the very first render, and only if the date
  // filter hasn't been touched yet (from/to still empty) - respects a filter
  // the user already had set (e.g. arriving from another page) instead of
  // silently overriding it.
  useEffect(() => {
    if (bucket !== 'hunt' && !from && !to) {
      setDateRange(periodRangeForDate(new Date(), bucket));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (showPlayerBreakdown) {
      api.getTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (!ignore) setPlayerTrend(res);
      });
    } else {
      api.getTrends({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (!ignore) setTrend(res);
      });
    }
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, chartBucket, showPlayerBreakdown]);

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
    if (chartBucket === 'hunt') return;
    const range = bucketRange(bucketStart, chartBucket);
    setPointFilter((prev) => (prev && prev.from === range.from && prev.to === range.to ? null : range));
  }

  const knownBucketStarts = showPlayerBreakdown ? playerTrend.map((p) => p.bucketStart) : trend.map((p) => p.bucketStart);
  const selectedBucketStart = pointFilter && chartBucket !== 'hunt'
    ? knownBucketStarts.find((bucketStart) => {
        const range = bucketRange(bucketStart, chartBucket);
        return range.from === pointFilter.from && range.to === pointFilter.to;
      })
    : undefined;

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
      <p className="page-subtitle">
        {overview.huntCount} hunt{overview.huntCount === 1 ? '' : 's'} no período selecionado.
        {pointFilter && selectedBucketStart && <> · {formatBucketLabel(selectedBucketStart, chartBucket)}</>}
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            Profit/h por {CHART_BUCKET_LABEL[chartBucket]}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {bucket !== 'hunt' && <PeriodNavigator bucket={bucket} />}
            <div className="bucket-toggle">
              {BUCKET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={bucket === opt.value ? '' : 'secondary'}
                  onClick={() => selectBucket(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          {showPlayerBreakdown ? (
            <>
              <PlayerLegend entries={playerSeries.map((s) => ({ id: s.playerId, name: s.playerName, color: s.color }))} />
              <MultiSeriesTrendChart
                series={playerSeries}
                bucket={chartBucket}
                onPointClick={chartBucket === 'hunt' ? undefined : handlePointClick}
                selectedBucketStart={selectedBucketStart}
              />
            </>
          ) : (
            <TrendChart
              data={trend}
              metricKey="avgProfitPerHour"
              seriesLabel={chartBucket === 'hunt' ? 'Profit/h' : 'Profit/h médio'}
              seriesColor="var(--series-1)"
              bucket={chartBucket}
              onPointClick={chartBucket === 'hunt' ? undefined : handlePointClick}
              selectedBucketStart={selectedBucketStart}
              rareDropThreshold={rareDropThreshold}
            />
          )}
        </div>
      </div>

      {pointFilter && (
        <div className="section" ref={drillDownRef} style={{ scrollMarginTop: 96 }}>
          <h2 className="section-title">
            Hunts em {selectedBucketStart ? formatBucketLabel(selectedBucketStart, chartBucket) : ''}
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
