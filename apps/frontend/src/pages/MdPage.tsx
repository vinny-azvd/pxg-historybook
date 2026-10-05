import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { parseHuntJson } from '../jsonParse';
import { ConfirmMdModal } from '../components/ConfirmMdModal';
import { MdCard } from '../components/MdCard';
import { CardSettingsPanel } from '../components/CardSettingsPanel';
import { PeriodNavigator } from '../components/PeriodNavigator';
import { TrendChart } from '../components/charts/TrendChart';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import { NameBreakdownChart } from '../components/charts/NameBreakdownChart';
import { PlayerLegend } from '../components/PlayerLegend';
import type { PlayerTrendPoint, MdDifficulty, MdListItem, MdOverviewStats, MdWeeklySummary, NameBreakdownRow } from '../api/types';
import { formatBucketLabel, formatCompact, formatDateTime, formatInt } from '../format';
import { bucketRange, periodRangeForDate } from '../dates';
import { MdWeekCard } from '../components/MdWeekCard';

type Tab = 'dashboard' | 'history' | 'upload';
type Bucket = 'all' | 'day' | 'week' | 'month' | 'md';

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'md', label: 'Por MD' },
];

const CHART_BUCKET_LABEL: Record<Exclude<Bucket, 'all'>, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mês',
  md: 'MD',
};

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
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const { rareDropThreshold, getPlayerColor } = usePreferences();
  const [overview, setOverview] = useState<MdOverviewStats | null>(null);
  // Unaffected by the from/to period filter, unlike `overview` - so
  // navigating to a period with zero mds (e.g. an empty week) doesn't
  // get mistaken for "nothing imported yet" and blank out the whole page.
  const [totalMdCount, setTotalMdCount] = useState<number | null>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [playerTrend, setPlayerTrend] = useState<PlayerTrendPoint[]>([]);
  const [byName, setByName] = useState<NameBreakdownRow[]>([]);
  const [bucket, setBucket] = useState<Bucket>('week');
  const [pointFilter, setPointFilter] = useState<{ from: string; to: string } | null>(null);
  const [dayTrend, setDayTrend] = useState<any[]>([]);
  const [dayMds, setDayMds] = useState<MdListItem[]>([]);
  const [dayMdsLoading, setDayMdsLoading] = useState(false);
  const drillDownRef = useRef<HTMLDivElement>(null);

  // No single character selected - color-code the main chart per player
  // instead of blending everyone into one averaged line, same as the Hunts
  // dashboard. The per-md granularity already colors by top drop, so it
  // keeps its own single line rather than layering both signals into one chart.
  const showPlayerBreakdown = !player && bucket !== 'md';
  const showNameBreakdown = bucket === 'md';

  // The bucket toggle picks which single period you're browsing (a day, a
  // week, a month), but the chart itself always drills one level finer than
  // that: a week shows its days, a month shows its weeks, a day shows its
  // individual mds, and "Tudo" shows every month on record. "Por MD" isn't a
  // time axis at all - it groups by MD name across whatever the outer date
  // filter is, comparing each MD's average profit per run against the others.
  const chartBucket: Exclude<Bucket, 'all'> =
    bucket === 'all' ? 'month' : bucket === 'day' ? 'md' : bucket === 'week' ? 'day' : bucket === 'month' ? 'week' : 'md';

  // Switching the bucket toggle always lands on the current day/week/month
  // (or clears the range for "Tudo") rather than one derived from the range
  // already in view - deriving it from a past month dropped "Semana" onto
  // that month's first week, often an empty one.
  function selectBucket(next: Bucket) {
    setBucket(next);
    if (next === 'md') return;
    if (next === 'all') setDateRange({ from: '', to: '' });
    else setDateRange(periodRangeForDate(new Date(), next));
  }

  // Same pinning, but only for the very first render, and only if the date
  // filter hasn't been touched yet (from/to still empty) - respects a filter
  // the user already had set (e.g. arriving from another page) instead of
  // silently overriding it.
  useEffect(() => {
    if (bucket !== 'md' && bucket !== 'all' && !from && !to) {
      setDateRange(periodRangeForDate(new Date(), bucket));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clearing the range from elsewhere ("Limpar filtro de período", the
  // header's "Todo o período") leaves no single day/week/month to browse, so
  // follow it to "Tudo" instead of labelling an all-time chart as one week.
  // Only reacts to a set range becoming empty, so the initial empty range
  // (before the mount effect above pins the default one) doesn't count.
  const prevRangeRef = useRef({ from, to });
  useEffect(() => {
    const prev = prevRangeRef.current;
    prevRangeRef.current = { from, to };
    const wasSet = Boolean(prev.from || prev.to);
    if (wasSet && !from && !to && (bucket === 'day' || bucket === 'week' || bucket === 'month')) setBucket('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    setPointFilter(null);
  }, [player, sessionType, from, to, bucket]);

  const overviewRange = pointFilter ?? { from, to };

  useEffect(() => {
    let ignore = false;
    api.getMdOverview({ player, sessionType, from: overviewRange.from, to: overviewRange.to }).then((res) => {
      if (!ignore) setOverview(res);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, overviewRange.from, overviewRange.to]);

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
        if (!ignore) setPlayerTrend(res);
      });
    } else {
      api.getMdTrends({ player, sessionType, from, to, bucket: chartBucket }).then((res) => {
        if (!ignore) setTrend(res);
      });
    }
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, chartBucket, showPlayerBreakdown, showNameBreakdown]);

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
      setDayMds([]);
      return;
    }
    let ignore = false;
    setDayMdsLoading(true);
    Promise.all([
      api.getMdTrends({ player, sessionType, from: pointFilter.from, to: pointFilter.to, bucket: 'md' }),
      api.getMds({
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
      .then(([trendRes, mdsRes]) => {
        if (ignore) return;
        setDayTrend(trendRes);
        setDayMds(mdsRes.items);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            drillDownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      })
      .finally(() => {
        if (!ignore) setDayMdsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, pointFilter?.from, pointFilter?.to]);

  function handlePointClick(bucketStart: string) {
    if (chartBucket === 'md') return;
    const range = bucketRange(bucketStart, chartBucket);
    setPointFilter((prev) => (prev && prev.from === range.from && prev.to === range.to ? null : range));
  }

  const knownBucketStarts = showPlayerBreakdown ? playerTrend.map((p) => p.bucketStart) : trend.map((p: any) => p.bucketStart);
  const selectedBucketStart = pointFilter && chartBucket !== 'md'
    ? knownBucketStarts.find((bucketStart: string) => {
        const range = bucketRange(bucketStart, chartBucket);
        return range.from === pointFilter.from && range.to === pointFilter.to;
      })
    : undefined;

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
            {showNameBreakdown ? 'Profit médio por MD' : `Profit por ${CHART_BUCKET_LABEL[chartBucket]}`}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {(bucket === 'day' || bucket === 'week' || bucket === 'month') && <PeriodNavigator bucket={bucket} />}
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
          {showNameBreakdown ? (
            <NameBreakdownChart data={byName} metricKey="avgProfit" seriesLabel="Profit médio" unitLabel="MD" />
          ) : showPlayerBreakdown ? (
            <>
              <PlayerLegend entries={playerSeries.map((s) => ({ id: s.playerId, name: s.playerName, color: s.color }))} />
              <MultiSeriesTrendChart
                rareDropThreshold={rareDropThreshold}
                series={playerSeries}
                bucket={chartBucket}
                metricKey="avgProfit"
                onPointClick={chartBucket === 'md' ? undefined : handlePointClick}
                selectedBucketStart={selectedBucketStart}
              />
            </>
          ) : (
            <TrendChart
              data={trend}
              metricKey="avgProfit"
              seriesLabel={chartBucket === 'md' ? 'Profit' : 'Profit médio'}
              seriesColor="var(--series-1)"
              bucket={chartBucket}
              unitLabel="md"
              onPointClick={chartBucket === 'md' ? undefined : handlePointClick}
              selectedBucketStart={selectedBucketStart}
              rareDropThreshold={rareDropThreshold}
            />
          )}
        </div>
      </div>

      {pointFilter && (
        <div className="section" ref={drillDownRef} style={{ scrollMarginTop: 96 }}>
          <h2 className="section-title">
            MDs em {selectedBucketStart ? formatBucketLabel(selectedBucketStart, chartBucket) : ''}
            {!dayMdsLoading && <> ({dayMds.length})</>}
          </h2>
          {dayMdsLoading ? (
            <div className="empty-state">Carregando...</div>
          ) : dayMds.length === 0 ? (
            <div className="empty-state">Nenhuma MD nesse período.</div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 14 }}>
                <TrendChart
                  data={dayTrend}
                  metricKey="avgProfit"
                  seriesLabel="Profit"
                  seriesColor="var(--series-1)"
                  bucket="md"
                  unitLabel="md"
                  rareDropThreshold={rareDropThreshold}
                />
              </div>
              <div className="hunt-card-grid">
                {dayMds.map((md) => (
                  <MdCard key={md.id} md={md} />
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
