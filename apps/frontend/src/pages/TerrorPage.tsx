import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { usePlayerColor } from '../playerColors';
import { parseHuntJson } from '../jsonParse';
import { ConfirmTerrorModal } from '../components/ConfirmTerrorModal';
import { CardSettingsPanel } from '../components/CardSettingsPanel';
import { TrendChart } from '../components/charts/TrendChart';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import { PlayerLegend } from '../components/PlayerLegend';
import { PeriodCards } from '../components/themes/PeriodCards';
import { ScopeBreadcrumb, ScopeToolbar, bucketNoun, useChartScope } from '../chartScope';
import type { PlayerTrendPoint, TerrorOverviewStats, TerrorWeeklySummary } from '../api/types';
import { formatCompact, formatDateTime, formatInt } from '../format';
import { TerrorWeekCard } from '../components/TerrorWeekCard';
import { TerrorBossGallery } from '../components/bosses/TerrorBossGallery';

type Tab = 'dashboard' | 'history' | 'upload';
// Reserves room for 2 lines so the highlight cards don't change height
// depending on whether their text wraps (a long terror name/date) or is a
// short one-liner (the "Sem terrors no período" placeholder).
const highlightTextStyle: CSSProperties = { margin: 0, fontSize: 14, minHeight: 40, lineHeight: '20px' };

export function TerrorPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div>
      <h1 className="page-title">Terror</h1>
      <div className="bucket-toggle" style={{ marginBottom: 16 }}>
        <button className={tab === 'dashboard' ? '' : 'secondary'} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button className={tab === 'history' ? '' : 'secondary'} onClick={() => setTab('history')}>
          Histórico
        </button>
        <button className={tab === 'upload' ? '' : 'secondary'} onClick={() => setTab('upload')}>
          Importar terror
        </button>
      </div>

      {tab === 'dashboard' && <TerrorDashboardTab />}
      {tab === 'history' && <TerrorHistoryTab />}
      {tab === 'upload' && <TerrorUploadTab onImported={() => setTab('history')} />}
    </div>
  );
}

function TerrorDashboardTab() {
  const { player, sessionType, from, to } = useFilters();
  const { rareDropThreshold } = usePreferences();
  const getPlayerColor = usePlayerColor();
  const [overview, setOverview] = useState<TerrorOverviewStats | null>(null);
  // Unaffected by the from/to period filter, unlike `overview` - so
  // navigating to a period with zero terrors (e.g. an empty week) doesn't
  // get mistaken for "nothing imported yet" and blank out the whole page.
  const [totalTerrorCount, setTotalTerrorCount] = useState<number | null>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [playerTrend, setPlayerTrend] = useState<PlayerTrendPoint[]>([]);
  // The bucket and range the loaded trend rows are for: a granularity switch or
  // a step with the arrows must not plot the old rows under the new axis labels.
  const [trendBucket, setTrendBucket] = useState<string | null>(null);
  // The chart is a comparison over time: the Tudo/Dia/Semana/Mês buttons pick
  // the size of each point, clicking or dragging zooms in (see chartScope).
  // Zoomed down to a day (or a short selection) each point is one terror.
  const scope = useChartScope({ entryBucket: 'terror' });
  const chartBucket = scope.chartBucket as 'day' | 'week' | 'month' | 'terror';

  // No single character selected - color-code the main chart per player
  // instead of blending everyone into one averaged line, same as the Hunts
  // dashboard. The per-terror level already colors by top drop, so it keeps
  // its own single line rather than layering both signals into one chart.
  const showPlayerBreakdown = !player && !scope.isEntryLevel;

  useEffect(() => {
    let ignore = false;
    api.getTerrorOverview({ player, sessionType, from, to }).then((res) => {
      if (!ignore) setOverview(res);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to]);

  useEffect(() => {
    let ignore = false;
    api.getTerrorOverview({ player, sessionType }).then((res) => {
      if (!ignore) setTotalTerrorCount(res.terrorCount);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType]);

  useEffect(() => {
    let ignore = false;
    if (showPlayerBreakdown) {
      api.getTerrorTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (ignore) return;
        setPlayerTrend(res);
        setTrendBucket(`player:${chartBucket}:${from}:${to}`);
      });
    } else {
      api.getTerrorTrends({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (ignore) return;
        setTrend(res);
        setTrendBucket(`single:${chartBucket}:${from}:${to}`);
      });
    }
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, chartBucket, showPlayerBreakdown]);

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

  if (!overview || totalTerrorCount === null) return <div className="empty-state">Carregando...</div>;

  if (totalTerrorCount === 0) {
    return (
      <div className="empty-state">
        Nenhum terror registrado ainda. Use a aba "Importar terror" para começar a ver os dashboards.
      </div>
    );
  }

  return (
    <div>
      <p className="page-subtitle">
        {overview.terrorCount} terror{overview.terrorCount === 1 ? '' : 'es'} no período selecionado.
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
        <StatTileLite label="Rotações realizadas" value={formatInt(overview.terrorCount)} />
        <StatTileLite label="Profit total" value={formatCompact(overview.totalProfit)} />
        <StatTileLite
          label="Profit médio"
          value={formatCompact(overview.avgProfit)}
          sub={`máx ${formatCompact(overview.maxProfit)} numa rotação`}
        />
        <StatTileLite label="Exp médio" value={formatCompact(overview.avgExperience)} />
        <StatTileLite
          label="Nightmare tokens / try"
          value={formatInt(overview.avgNightmareTokens)}
          sub="média de tokens gastos por rotação"
        />
      </div>

      {/* Always rendered, even with placeholders, so navigating to an empty
          period doesn't collapse this block and shove the rest of the page
          up - only the text inside changes, not the layout around it. */}
      <div className="highlight-grid section" style={{ marginBottom: 24 }}>
        <div className="card">
          <h2 className="section-title">Terror mais lucrativo</h2>
          {overview.mostProfitableTerror ? (
            <p style={highlightTextStyle}>
              <Link to={`/terror/${overview.mostProfitableTerror.id}`}>
                {overview.mostProfitableTerror.terrorName ?? 'Terror'}
              </Link>{' '}
              ({overview.mostProfitableTerror.players.join(', ') || '—'}) em{' '}
              {formatDateTime(overview.mostProfitableTerror.startTime)} — profit de{' '}
              {formatCompact(overview.mostProfitableTerror.profit)}
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem terrors no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">Terror menos lucrativo</h2>
          {overview.leastProfitableTerror ? (
            <p style={highlightTextStyle}>
              <Link to={`/terror/${overview.leastProfitableTerror.id}`}>
                {overview.leastProfitableTerror.terrorName ?? 'Terror'}
              </Link>{' '}
              ({overview.leastProfitableTerror.players.join(', ') || '—'}) em{' '}
              {formatDateTime(overview.leastProfitableTerror.startTime)} — profit de{' '}
              {formatCompact(overview.leastProfitableTerror.profit)}
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem terrors no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">Terror mais feito</h2>
          {overview.mostFrequentTerror ? (
            <p style={highlightTextStyle}>
              <strong>{overview.mostFrequentTerror.terrorName}</strong> — {overview.mostFrequentTerror.count} terror
              {overview.mostFrequentTerror.count === 1 ? '' : 'es'} registrado
              {overview.mostFrequentTerror.count === 1 ? '' : 's'} no período
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem terrors no período.</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="scope-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            Profit por {bucketNoun(chartBucket, 'terror')}
          </h2>
          <ScopeToolbar scope={scope} />
        </div>
        <ScopeBreadcrumb scope={scope} />
        <div className="card">
          {!trendReady ? (
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
                onZoomOut={scope.depth > 0 ? () => scope.goTo(scope.depth - 1) : undefined}
              />
            </>
          ) : (
            <TrendChart
              data={trend}
              metricKey="avgProfit"
              seriesLabel={chartBucket === 'terror' ? 'Profit' : 'Profit médio'}
              seriesColor="var(--series-1)"
              bucket={chartBucket}
              range={scope.range}
              unitLabel="terror"
              onZoom={scope.canZoom ? scope.zoom : undefined}
              onZoomSpan={scope.canZoom ? scope.zoomSpan : undefined}
              onZoomOut={scope.depth > 0 ? () => scope.goTo(scope.depth - 1) : undefined}
              rareDropThreshold={rareDropThreshold}
            />
          )}
        </div>
      </div>

      <PeriodCards kind="terror" entryLevel={scope.isEntryLevel} periodLabel={scope.label} />

      {/* Bosses gallery (boss images agent): self-contained, keep as the last child of the dashboard. */}
      <TerrorBossGallery />
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

function TerrorHistoryTab() {
  const { player, sessionType, from, to } = useFilters();
  const [weeks, setWeeks] = useState<TerrorWeeklySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 10;

  useEffect(() => {
    setLoading(true);
    api
      .getTerrorsWeekly({ player, sessionType, from, to, page, pageSize })
      .then((res) => {
        setWeeks(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [player, sessionType, from, to, page]);

  useEffect(() => setPage(1), [player, sessionType, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalTerrors = weeks.reduce((sum, w) => sum + w.terrorCount, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <p className="page-subtitle">
          {total} semana{total === 1 ? '' : 's'} com terror registrado
          {weeks.length > 0 && ` (${totalTerrors} nesta página)`}.
        </p>
        <CardSettingsPanel />
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : weeks.length === 0 ? (
        <div className="empty-state">Nenhum terror encontrado. Use a aba "Importar terror" para começar.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {weeks.map((week) => (
            <TerrorWeekCard key={week.weekStart} summary={week} filters={{ player, sessionType }} />
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
  | { kind: 'duplicate'; terrorId: number }
  | { kind: 'success'; terrorId: number; players: string[]; terrorName: string | null };

function TerrorUploadTab({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: 'idle' });
  const [pendingTerror, setPendingTerror] = useState<any | null>(null);
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
    setPendingTerror(parsed.data);
  }

  async function confirmUpload(terrorName: string) {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await api.uploadTerror({ terror: pendingTerror, terrorName });
      if (res.status === 409) {
        setPendingTerror(null);
        setStatus({ kind: 'duplicate', terrorId: res.body.existingTerrorId });
      } else if (!res.ok) {
        const issues = res.body.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n');
        setModalError(issues || res.body.error || 'Falha ao importar o terror.');
      } else {
        setPendingTerror(null);
        setStatus({ kind: 'success', terrorId: res.body.id, players: res.body.players, terrorName: res.body.terrorName });
        setText('');
        refreshPlayers();
        onImported();
      }
    } catch (err) {
      setModalError(`Falha ao enviar o terror para o servidor: ${err instanceof Error ? err.message : String(err)}`);
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
          Esse terror já foi importado antes. <Link to={`/terror/${status.terrorId}`}>Ver terror existente</Link>
        </div>
      )}
      {status.kind === 'success' && (
        <div className="success-box">
          Terror {status.terrorName ? `de ${status.terrorName} ` : ''}importado com sucesso ({status.players.join(', ')}).{' '}
          <Link to={`/terror/${status.terrorId}`}>Ver detalhes</Link>
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
        Arraste o arquivo .json do terror aqui
      </div>

      <textarea
        rows={16}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }}
        placeholder="Cole aqui o JSON exportado do terror..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button disabled={!text.trim()} onClick={() => parseAndPreview(text)}>
          Importar terror
        </button>
      </div>

      {pendingTerror && (
        <ConfirmTerrorModal
          terror={pendingTerror}
          submitting={submitting}
          errorMessage={modalError}
          onConfirm={confirmUpload}
          onCancel={() => {
            setPendingTerror(null);
            setModalError(null);
          }}
        />
      )}
    </div>
  );
}
