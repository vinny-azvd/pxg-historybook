import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { usePlayerColor } from '../playerColors';
import { parseHuntJson } from '../jsonParse';
import { ConfirmMdModal } from '../components/ConfirmMdModal';
import { CardSettingsPanel } from '../components/CardSettingsPanel';
import { TrendChart } from '../components/charts/TrendChart';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import { NameBreakdownChart } from '../components/charts/NameBreakdownChart';
import { PlayerLegend } from '../components/PlayerLegend';
import { PeriodCards } from '../components/themes/PeriodCards';
import { ScopeBreadcrumb, ScopeToolbar, bucketNoun, useChartScope } from '../chartScope';
import type { PlayerTrendPoint, MdDifficulty, MdOverviewStats, MdWeeklySummary, NameBreakdownRow } from '../api/types';
import { formatCompact, formatDateTime, formatInt } from '../format';
import { MdWeekCard } from '../components/MdWeekCard';

type Tab = 'dashboard' | 'history' | 'upload';

// Reserves room for 2 lines so the highlight cards don't change height
// depending on whether their text wraps (a long md name/date) or is a
// short one-liner (the "Sem mds no período" placeholder).
const highlightTextStyle: CSSProperties = { margin: 0, fontSize: 14, minHeight: 40, lineHeight: '20px' };

export function MdPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div>
      <h1 className="page-title">MD</h1>
      <div className="bucket-toggle" style={{ marginBottom: 16 }}>
        <button className={tab === 'dashboard' ? '' : 'secondary'} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button className={tab === 'history' ? '' : 'secondary'} onClick={() => setTab('history')}>
          Histórico
        </button>
        <button className={tab === 'upload' ? '' : 'secondary'} onClick={() => setTab('upload')}>
          Importar MD
        </button>
      </div>

      {tab === 'dashboard' && <MdDashboardTab />}
      {tab === 'history' && <MdHistoryTab />}
      {tab === 'upload' && <MdUploadTab onImported={() => setTab('history')} />}
    </div>
  );
}

function MdDashboardTab() {
  const { player, sessionType, from, to } = useFilters();
  const { rareDropThreshold } = usePreferences();
  const getPlayerColor = usePlayerColor();
  const [overview, setOverview] = useState<MdOverviewStats | null>(null);
  // Unaffected by the from/to period filter, unlike `overview` - so
  // navigating to a period with zero mds (e.g. an empty week) doesn't
  // get mistaken for "nothing imported yet" and blank out the whole page.
  const [totalMdCount, setTotalMdCount] = useState<number | null>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [playerTrend, setPlayerTrend] = useState<PlayerTrendPoint[]>([]);
  // The bucket and range the loaded trend rows are for: a granularity switch or
  // a step with the arrows must not plot the old rows under the new axis labels.
  const [trendBucket, setTrendBucket] = useState<string | null>(null);
  const [byName, setByName] = useState<NameBreakdownRow[]>([]);
  // The chart is either a comparison over time (granularity, zoom: see
  // chartScope) or the ranking by MD name ("Por MD").
  const [view, setView] = useState<'time' | 'name'>('time');
  const scope = useChartScope({ entryBucket: 'md' });

  // No single character selected - color-code the main chart per player
  // instead of blending everyone into one averaged line, same as the Hunts
  // dashboard. Zoomed down to single MDs the points are colored by top drop,
  // so that level keeps its own single line rather than layering both
  // signals into one chart. "Por MD" isn't a time axis at all - it groups by
  // MD name across the period filter, comparing each MD's average profit per
  // run against the others.
  const showNameBreakdown = view === 'name';
  const chartBucket = scope.chartBucket as 'day' | 'week' | 'month' | 'md';
  const showPlayerBreakdown = !player && !showNameBreakdown && !scope.isEntryLevel;

  useEffect(() => {
    let ignore = false;
    api.getMdOverview({ player, sessionType, from, to }).then((res) => {
      if (!ignore) setOverview(res);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to]);

  useEffect(() => {
    let ignore = false;
    api.getMdOverview({ player, sessionType }).then((res) => {
      if (!ignore) setTotalMdCount(res.mdCount);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType]);

  useEffect(() => {
    let ignore = false;
    if (showNameBreakdown) {
      api.getMdByName({ player, sessionType, from, to }).then((res) => {
        if (!ignore) setByName(res);
      });
    } else if (showPlayerBreakdown) {
      api.getMdTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (ignore) return;
        setPlayerTrend(res);
        setTrendBucket(`player:${chartBucket}:${from}:${to}`);
      });
    } else {
      api.getMdTrends({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
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

  if (!overview || totalMdCount === null) return <div className="empty-state">Carregando...</div>;

  if (totalMdCount === 0) {
    return (
      <div className="empty-state">
        Nenhuma MD registrada ainda. Use a aba "Importar MD" para começar a ver os dashboards.
      </div>
    );
  }

  return (
    <div>
      <p className="page-subtitle">
        {overview.mdCount} MD{overview.mdCount === 1 ? '' : 's'} no período selecionado.
        {(from || to) && (
          <>
            {' '}
            <button
              className="secondary"
              style={{ fontSize: 11.5, padding: '2px 8px', marginLeft: 4 }}
              onClick={() => {
                setView('time');
                scope.setGranularity('all');
              }}
            >
              Ver todo o período
            </button>
          </>
        )}
      </p>

      <div className="stat-grid">
        <StatTileLite label="Bosses derrotados" value={formatInt(overview.mdCount)} />
        <StatTileLite label="Profit total" value={formatCompact(overview.totalProfit)} />
        <StatTileLite
          label="Profit médio"
          value={formatCompact(overview.avgProfit)}
          sub={`máx ${formatCompact(overview.maxProfit)} numa rotação`}
        />
        <StatTileLite label="Exp médio" value={formatCompact(overview.avgExperience)} />
      </div>

      {/* Always rendered, even with placeholders, so navigating to an empty
          period doesn't collapse this block and shove the rest of the page
          up - only the text inside changes, not the layout around it. */}
      <div className="highlight-grid section" style={{ marginBottom: 24 }}>
        <div className="card">
          <h2 className="section-title">MD mais lucrativa</h2>
          {overview.mostProfitableMd ? (
            <p style={highlightTextStyle}>
              <Link to={`/md/${overview.mostProfitableMd.id}`}>
                {overview.mostProfitableMd.mdName ?? 'MD'}
              </Link>{' '}
              ({overview.mostProfitableMd.players.join(', ') || '—'}) em{' '}
              {formatDateTime(overview.mostProfitableMd.startTime)} — profit de{' '}
              {formatCompact(overview.mostProfitableMd.profit)}
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem MDs no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">MD menos lucrativa</h2>
          {overview.leastProfitableMd ? (
            <p style={highlightTextStyle}>
              <Link to={`/md/${overview.leastProfitableMd.id}`}>
                {overview.leastProfitableMd.mdName ?? 'MD'}
              </Link>{' '}
              ({overview.leastProfitableMd.players.join(', ') || '—'}) em{' '}
              {formatDateTime(overview.leastProfitableMd.startTime)} — profit de{' '}
              {formatCompact(overview.leastProfitableMd.profit)}
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem MDs no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">MD mais feita</h2>
          {overview.mostFrequentMd ? (
            <p style={highlightTextStyle}>
              <strong>{overview.mostFrequentMd.mdName}</strong> — {overview.mostFrequentMd.count} MD
              {overview.mostFrequentMd.count === 1 ? '' : 's'} registrada
              {overview.mostFrequentMd.count === 1 ? '' : 's'} no período
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem MDs no período.</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="scope-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            {showNameBreakdown ? 'Profit médio por MD' : `Profit por ${bucketNoun(chartBucket, 'MD')}`}
          </h2>
          <ScopeToolbar
            scope={scope}
            onGranularity={(granularity) => {
              setView('time');
              scope.setGranularity(granularity);
            }}
            extra={{
              label: 'Por MD',
              title: 'Ranking por nome de MD no período',
              active: showNameBreakdown,
              onSelect: () => setView('name'),
            }}
          />
        </div>
        {!showNameBreakdown && <ScopeBreadcrumb scope={scope} />}
        <div className="card">
          {showNameBreakdown ? (
            <NameBreakdownChart data={byName} metricKey="avgProfit" seriesLabel="Profit médio" unitLabel="MD" />
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
                metricKey="avgProfit"
                onZoom={scope.canZoom ? scope.zoom : undefined}
                onZoomSpan={scope.canZoom ? scope.zoomSpan : undefined}
              />
            </>
          ) : (
            <TrendChart
              data={trend}
              metricKey="avgProfit"
              seriesLabel={chartBucket === 'md' ? 'Profit' : 'Profit médio'}
              seriesColor="var(--series-1)"
              bucket={chartBucket}
              range={scope.range}
              unitLabel="md"
              onZoom={scope.canZoom ? scope.zoom : undefined}
              onZoomSpan={scope.canZoom ? scope.zoomSpan : undefined}
              rareDropThreshold={rareDropThreshold}
            />
          )}
        </div>
      </div>

      <PeriodCards kind="md" entryLevel={!showNameBreakdown && scope.isEntryLevel} periodLabel={scope.label} />
    </div>
  );
}

function StatTileLite({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={onClick ? 'stat-tile clickable' : 'stat-tile'}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function MdHistoryTab() {
  const { player, sessionType, from, to } = useFilters();
  const [weeks, setWeeks] = useState<MdWeeklySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 10;

  useEffect(() => {
    setLoading(true);
    api
      .getMdsWeekly({ player, sessionType, from, to, page, pageSize })
      .then((res) => {
        setWeeks(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [player, sessionType, from, to, page]);

  useEffect(() => setPage(1), [player, sessionType, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalMds = weeks.reduce((sum, w) => sum + w.mdCount, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <p className="page-subtitle">
          {total} semana{total === 1 ? '' : 's'} com MD registrada
          {weeks.length > 0 && ` (${totalMds} nesta página)`}.
        </p>
        <CardSettingsPanel />
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : weeks.length === 0 ? (
        <div className="empty-state">Nenhuma MD encontrada. Use a aba "Importar MD" para começar.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {weeks.map((week) => (
            <MdWeekCard key={week.weekStart} summary={week} filters={{ player, sessionType }} />
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
  | { kind: 'duplicate'; mdId: number }
  | { kind: 'success'; mdId: number; players: string[]; mdName: string | null };

function MdUploadTab({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: 'idle' });
  const [pendingMd, setPendingMd] = useState<any | null>(null);
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
    setPendingMd(parsed.data);
  }

  async function confirmUpload(mdName: string, difficulty: MdDifficulty | null) {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await api.uploadMd({ md: pendingMd, mdName, difficulty });
      if (res.status === 409) {
        setPendingMd(null);
        setStatus({ kind: 'duplicate', mdId: res.body.existingMdId });
      } else if (!res.ok) {
        const issues = res.body.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n');
        setModalError(issues || res.body.error || 'Falha ao importar a MD.');
      } else {
        setPendingMd(null);
        setStatus({ kind: 'success', mdId: res.body.id, players: res.body.players, mdName: res.body.mdName });
        setText('');
        refreshPlayers();
        onImported();
      }
    } catch (err) {
      setModalError(`Falha ao enviar a MD para o servidor: ${err instanceof Error ? err.message : String(err)}`);
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
          Essa MD já foi importada antes. <Link to={`/md/${status.mdId}`}>Ver MD existente</Link>
        </div>
      )}
      {status.kind === 'success' && (
        <div className="success-box">
          MD {status.mdName ? `de ${status.mdName} ` : ''}importada com sucesso ({status.players.join(', ')}).{' '}
          <Link to={`/md/${status.mdId}`}>Ver detalhes</Link>
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
        Arraste o arquivo .json da MD aqui
      </div>

      <textarea
        rows={16}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }}
        placeholder="Cole aqui o JSON exportado da MD..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button disabled={!text.trim()} onClick={() => parseAndPreview(text)}>
          Importar MD
        </button>
      </div>

      {pendingMd && (
        <ConfirmMdModal
          md={pendingMd}
          submitting={submitting}
          errorMessage={modalError}
          onConfirm={confirmUpload}
          onCancel={() => {
            setPendingMd(null);
            setModalError(null);
          }}
        />
      )}
    </div>
  );
}
