import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { parseHuntJson } from '../jsonParse';
import { ConfirmTerrorModal } from '../components/ConfirmTerrorModal';
import { TerrorCard } from '../components/TerrorCard';
import { CardSettingsPanel } from '../components/CardSettingsPanel';
import { TrendChart } from '../components/charts/TrendChart';
import type { TerrorListItem, TerrorOverviewStats, TerrorRareKillRow } from '../api/types';
import { formatBucketLabel, formatCompact, formatDateTime, formatHours, formatInt } from '../format';
import { bucketRange } from '../dates';

type Tab = 'dashboard' | 'history' | 'upload';
type Bucket = 'day' | 'week' | 'month' | 'terror';

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'terror', label: 'Por terror' },
];

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'start_time', label: 'Data' },
  { key: 'terror_name', label: 'Terror' },
  { key: 'duration_seconds', label: 'Duração' },
  { key: 'profit', label: 'Profit' },
  { key: 'profit_per_hour', label: 'Profit/h' },
  { key: 'kills_per_hour', label: 'Kills/h' },
  { key: 'rare_kills_per_hour', label: 'Raros/h' },
];

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
  const { rareDropThreshold } = usePreferences();
  const [overview, setOverview] = useState<TerrorOverviewStats | null>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [bucket, setBucket] = useState<Bucket>('week');
  const [pointFilter, setPointFilter] = useState<{ from: string; to: string } | null>(null);
  const [dayTrend, setDayTrend] = useState<any[]>([]);
  const [dayTerrors, setDayTerrors] = useState<TerrorListItem[]>([]);
  const [dayTerrorsLoading, setDayTerrorsLoading] = useState(false);
  const [showRareKills, setShowRareKills] = useState(false);
  const [rareKills, setRareKills] = useState<TerrorRareKillRow[]>([]);
  const [rareKillsLoading, setRareKillsLoading] = useState(false);
  const drillDownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPointFilter(null);
  }, [player, sessionType, from, to, bucket]);

  const overviewRange = pointFilter ?? { from, to };

  useEffect(() => {
    if (!showRareKills) return;
    let ignore = false;
    setRareKillsLoading(true);
    api
      .getTerrorRareKills({ player, sessionType, from: overviewRange.from, to: overviewRange.to })
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
    api.getTerrorOverview({ player, sessionType, from: overviewRange.from, to: overviewRange.to }).then((res) => {
      if (!ignore) setOverview(res);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, overviewRange.from, overviewRange.to]);

  useEffect(() => {
    let ignore = false;
    api.getTerrorTrends({ player, sessionType, from, to, bucket }).then((res) => {
      if (!ignore) setTrend(res);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, bucket]);

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
    if (bucket === 'terror') return;
    const range = bucketRange(bucketStart, bucket);
    setPointFilter((prev) => (prev && prev.from === range.from && prev.to === range.to ? null : range));
  }

  const knownBucketStarts = trend.map((p: any) => p.bucketStart);
  const selectedBucketStart = pointFilter && bucket !== 'terror'
    ? knownBucketStarts.find((bucketStart: string) => {
        const range = bucketRange(bucketStart, bucket);
        return range.from === pointFilter.from && range.to === pointFilter.to;
      })
    : undefined;

  if (!overview) return <div className="empty-state">Carregando...</div>;

  if (overview.terrorCount === 0) {
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
        <StatTileLite label="Horas caçadas" value={formatHours(overview.totalDurationSeconds)} />
        <StatTileLite label="Profit total" value={formatCompact(overview.totalProfit)} />
        <StatTileLite
          label="Profit/h médio"
          value={formatCompact(overview.avgProfitPerHour)}
          sub={`máx ${formatCompact(overview.maxProfitPerHour)}`}
        />
        <StatTileLite label="Kills total" value={formatInt(overview.totalKills)} />
        <StatTileLite
          label="Kills/h médio"
          value={formatInt(overview.avgKillsPerHour)}
          sub={`máx ${formatInt(overview.maxKillsPerHour)}/h · recorde ${formatInt(overview.maxKills)} num terror`}
        />
        <StatTileLite
          label="Raros total"
          value={formatInt(overview.totalRareKills)}
          onClick={() => setShowRareKills((v) => !v)}
        />
        <StatTileLite
          label="Raros/h médio"
          value={formatInt(overview.avgRareKillsPerHour)}
          sub={`máx ${formatInt(overview.maxRareKillsPerHour)}/h · recorde ${formatInt(overview.maxRareKills)} num terror`}
        />
        <StatTileLite label="Exp/h médio" value={formatCompact(overview.avgExperiencePerHour)} />
        <StatTileLite label="Suprimentos/h médio" value={formatCompact(overview.avgSuppliesPerHour)} />
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
                    <th>Terror</th>
                    <th>Data</th>
                    <th>Inimigo</th>
                    <th>Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {rareKills.map((rk) => (
                    <tr key={rk.id}>
                      <td>
                        <Link to={`/terror/${rk.terrorId}`}>{rk.terrorName ?? 'Terror'}</Link>
                      </td>
                      <td>{formatDateTime(rk.startTime)}</td>
                      <td>{rk.enemy}</td>
                      <td>{formatInt(rk.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {(overview.mostProfitableTerror || overview.leastProfitableTerror || overview.mostFrequentTerror) && (
        <div className="highlight-grid section" style={{ marginBottom: 24 }}>
          {overview.mostProfitableTerror && (
            <div className="card">
              <h2 className="section-title">Terror mais lucrativo</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                <Link to={`/terror/${overview.mostProfitableTerror.id}`}>
                  {overview.mostProfitableTerror.terrorName ?? 'Terror'}
                </Link>{' '}
                em {formatDateTime(overview.mostProfitableTerror.startTime)} — profit de{' '}
                {formatCompact(overview.mostProfitableTerror.profit)} (
                {formatCompact(overview.mostProfitableTerror.profitPerHour)}/h)
              </p>
            </div>
          )}
          {overview.leastProfitableTerror && (
            <div className="card">
              <h2 className="section-title">Terror menos lucrativo</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                <Link to={`/terror/${overview.leastProfitableTerror.id}`}>
                  {overview.leastProfitableTerror.terrorName ?? 'Terror'}
                </Link>{' '}
                em {formatDateTime(overview.leastProfitableTerror.startTime)} — profit de{' '}
                {formatCompact(overview.leastProfitableTerror.profit)} (
                {formatCompact(overview.leastProfitableTerror.profitPerHour)}/h)
              </p>
            </div>
          )}
          {overview.mostFrequentTerror && (
            <div className="card">
              <h2 className="section-title">Terror mais feito</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>{overview.mostFrequentTerror.terrorName}</strong> — {overview.mostFrequentTerror.count} terror
                {overview.mostFrequentTerror.count === 1 ? '' : 'es'} registrado
                {overview.mostFrequentTerror.count === 1 ? '' : 's'} no período
              </p>
            </div>
          )}
        </div>
      )}

      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Profit/h por{' '}
            {bucket === 'day' ? 'dia' : bucket === 'week' ? 'semana' : bucket === 'month' ? 'mês' : 'terror'}
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
            seriesLabel={bucket === 'terror' ? 'Profit/h' : 'Profit/h médio'}
            seriesColor="var(--series-1)"
            bucket={bucket}
            unitLabel="terror"
            onPointClick={bucket === 'terror' ? undefined : handlePointClick}
            selectedBucketStart={selectedBucketStart}
            rareDropThreshold={rareDropThreshold}
          />
        </div>
      </div>

      {pointFilter && (
        <div className="section" ref={drillDownRef} style={{ scrollMarginTop: 96 }}>
          <h2 className="section-title">
            Terrors em {selectedBucketStart ? formatBucketLabel(selectedBucketStart, bucket) : ''}
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
                  metricKey="avgProfitPerHour"
                  seriesLabel="Profit/h"
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
  const [items, setItems] = useState<TerrorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('start_time');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  useEffect(() => {
    setLoading(true);
    api
      .getTerrors({ player, sessionType, from, to, sort, order, page, pageSize })
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
        <p className="page-subtitle">
          {total} terror{total === 1 ? '' : 'es'} registrado{total === 1 ? '' : 's'}.
        </p>
        <CardSettingsPanel />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label htmlFor="terror-sort-select" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Ordenar por
        </label>
        <select id="terror-sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
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
        <div className="empty-state">Nenhum terror encontrado. Use a aba "Importar terror" para começar.</div>
      ) : (
        <div className="hunt-card-grid">
          {items.map((terror) => (
            <TerrorCard key={terror.id} terror={terror} />
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
