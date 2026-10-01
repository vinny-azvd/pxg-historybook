import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { parseHuntJson } from '../jsonParse';
import { ConfirmTerrorModal } from '../components/ConfirmTerrorModal';
import { TerrorCard } from '../components/TerrorCard';
import { CardSettingsPanel } from '../components/CardSettingsPanel';
import { PeriodNavigator } from '../components/PeriodNavigator';
import { TrendChart } from '../components/charts/TrendChart';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import { PlayerLegend } from '../components/PlayerLegend';
import type { PlayerTrendPoint, TerrorListItem, TerrorOverviewStats, TerrorWeeklySummary } from '../api/types';
import { formatBucketLabel, formatCompact, formatDateTime, formatInt } from '../format';
import { bucketRange, periodRangeForDate, referenceDateFromRange } from '../dates';
import { TerrorWeekCard } from '../components/TerrorWeekCard';

type Tab = 'dashboard' | 'history' | 'upload';
type Bucket = 'day' | 'week' | 'month' | 'terror';

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'terror', label: 'Por terror' },
];

const CHART_BUCKET_LABEL: Record<Bucket, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mês',
  terror: 'terror',
};

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
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const { rareDropThreshold, getPlayerColor } = usePreferences();
  const [overview, setOverview] = useState<TerrorOverviewStats | null>(null);
  // Unaffected by the from/to period filter, unlike `overview` - so
  // navigating to a period with zero terrors (e.g. an empty week) doesn't
  // get mistaken for "nothing imported yet" and blank out the whole page.
  const [totalTerrorCount, setTotalTerrorCount] = useState<number | null>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [playerTrend, setPlayerTrend] = useState<PlayerTrendPoint[]>([]);
  const [bucket, setBucket] = useState<Bucket>('week');
  const [pointFilter, setPointFilter] = useState<{ from: string; to: string } | null>(null);
  const [dayTrend, setDayTrend] = useState<any[]>([]);
  const [dayTerrors, setDayTerrors] = useState<TerrorListItem[]>([]);
  const [dayTerrorsLoading, setDayTerrorsLoading] = useState(false);
  const drillDownRef = useRef<HTMLDivElement>(null);

  // No single character selected - color-code the main chart per player
  // instead of blending everyone into one averaged line, same as the Hunts
  // dashboard. The per-terror granularity already colors by top drop, so it
  // keeps its own single line rather than layering both signals into one chart.
  const showPlayerBreakdown = !player && bucket !== 'terror';

  // The bucket toggle picks which single period you're browsing (a day, a
  // week, a month), but the chart itself always drills one level finer than
  // that: a week shows its days, a month shows its weeks, a day shows its
  // individual terrors. "Por terror" has no coarser period around it, so it
  // just shows terrors across whatever the outer date filter is.
  const chartBucket: Bucket = bucket === 'day' ? 'terror' : bucket === 'week' ? 'day' : bucket === 'month' ? 'week' : 'terror';

  // Switching the bucket toggle pins the outer date filter to a single
  // concrete day/week/month (defaulting to whichever one is already in view,
  // or today) - otherwise "Semana" over an unrestricted "Todo o período"
  // filter would still show every week ever recorded instead of just one.
  function selectBucket(next: Bucket) {
    setBucket(next);
    if (next === 'terror') return;
    setDateRange(periodRangeForDate(referenceDateFromRange(from, to), next));
  }

  // Same pinning, but only for the very first render, and only if the date
  // filter hasn't been touched yet (from/to still empty) - respects a filter
  // the user already had set (e.g. arriving from another page) instead of
  // silently overriding it.
  useEffect(() => {
    if (bucket !== 'terror' && !from && !to) {
      setDateRange(periodRangeForDate(new Date(), bucket));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPointFilter(null);
  }, [player, sessionType, from, to, bucket]);

  const overviewRange = pointFilter ?? { from, to };

  useEffect(() => {
    let ignore = false;
    api.getTerrorOverview({ player, sessionType, from: overviewRange.from, to: overviewRange.to }).then((res) => {
      if (!ignore) setOverview(res);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, overviewRange.from, overviewRange.to]);

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
        if (!ignore) setPlayerTrend(res);
      });
    } else {
      api.getTerrorTrends({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
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

  useEffect(() => {
    if (!pointFilter) {
      setDayTrend([]);
      setDayTerrors([]);
      return;
    }
    let ignore = false;
    setDayTerrorsLoading(true);
    Promise.all([
      api.getTerrorTrends({ player, sessionType, from: pointFilter.from, to: pointFilter.to, bucket: 'terror' }),
      api.getTerrors({
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
      .then(([trendRes, terrorsRes]) => {
        if (ignore) return;
        setDayTrend(trendRes);
        setDayTerrors(terrorsRes.items);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            drillDownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      })
      .finally(() => {
        if (!ignore) setDayTerrorsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, pointFilter?.from, pointFilter?.to]);

  function handlePointClick(bucketStart: string) {
    if (chartBucket === 'terror') return;
    const range = bucketRange(bucketStart, chartBucket);
    setPointFilter((prev) => (prev && prev.from === range.from && prev.to === range.to ? null : range));
  }

  const knownBucketStarts = showPlayerBreakdown ? playerTrend.map((p) => p.bucketStart) : trend.map((p: any) => p.bucketStart);
  const selectedBucketStart = pointFilter && chartBucket !== 'terror'
    ? knownBucketStarts.find((bucketStart: string) => {
        const range = bucketRange(bucketStart, chartBucket);
        return range.from === pointFilter.from && range.to === pointFilter.to;
      })
    : undefined;

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
            Profit por {CHART_BUCKET_LABEL[chartBucket]}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {bucket !== 'terror' && <PeriodNavigator bucket={bucket} />}
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
                metricKey="avgProfit"
                onPointClick={chartBucket === 'terror' ? undefined : handlePointClick}
                selectedBucketStart={selectedBucketStart}
              />
            </>
          ) : (
            <TrendChart
              data={trend}
              metricKey="avgProfit"
              seriesLabel={chartBucket === 'terror' ? 'Profit' : 'Profit médio'}
              seriesColor="var(--series-1)"
              bucket={chartBucket}
              unitLabel="terror"
              onPointClick={chartBucket === 'terror' ? undefined : handlePointClick}
              selectedBucketStart={selectedBucketStart}
              rareDropThreshold={rareDropThreshold}
            />
          )}
        </div>
      </div>

      {pointFilter && (
        <div className="section" ref={drillDownRef} style={{ scrollMarginTop: 96 }}>
          <h2 className="section-title">
            Terrors em {selectedBucketStart ? formatBucketLabel(selectedBucketStart, chartBucket) : ''}
            {!dayTerrorsLoading && <> ({dayTerrors.length})</>}
          </h2>
          {dayTerrorsLoading ? (
            <div className="empty-state">Carregando...</div>
          ) : dayTerrors.length === 0 ? (
            <div className="empty-state">Nenhum terror nesse período.</div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <TrendChart
                  data={dayTrend}
                  metricKey="avgProfit"
                  seriesLabel="Profit"
                  seriesColor="var(--series-1)"
                  bucket="terror"
                  unitLabel="terror"
                  rareDropThreshold={rareDropThreshold}
                />
              </div>
              <div className="hunt-card-grid">
                {dayTerrors.map((terror) => (
                  <TerrorCard key={terror.id} terror={terror} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
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
