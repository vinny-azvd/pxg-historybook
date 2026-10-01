import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { StatTile } from '../components/StatTile';
import { PeriodNavigator } from '../components/PeriodNavigator';
import { PlayerLegend } from '../components/PlayerLegend';
import { MultiSeriesTrendChart } from '../components/charts/MultiSeriesTrendChart';
import type { MdOverviewStats, OverviewStats, PlayerTrendPoint, TerrorOverviewStats } from '../api/types';
import { formatCompact, formatDateTime, formatHours, formatInt } from '../format';
import { periodRangeForDate, referenceDateFromRange } from '../dates';

type Bucket = 'day' | 'week' | 'month';

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

const CHART_BUCKET_LABEL: Record<Bucket, string> = { day: 'dia', week: 'semana', month: 'mês' };

type ContentKey = 'hunts' | 'terror' | 'md';

const CONTENT_OPTIONS: { key: ContentKey; label: string }[] = [
  { key: 'hunts', label: 'Hunts' },
  { key: 'terror', label: 'Terror' },
  { key: 'md', label: 'MD' },
];

// Reserves room for 2 lines so the highlight cards don't change height
// depending on whether their text wraps or is a short one-liner.
const highlightTextStyle: CSSProperties = { margin: 0, fontSize: 14, minHeight: 40, lineHeight: '20px' };

export function OverviewPage() {
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const { getPlayerColor } = usePreferences();
  const [huntsOverview, setHuntsOverview] = useState<OverviewStats | null>(null);
  const [terrorOverview, setTerrorOverview] = useState<TerrorOverviewStats | null>(null);
  const [mdOverview, setMdOverview] = useState<MdOverviewStats | null>(null);
  // Unaffected by the from/to period filter, unlike the overviews above - so
  // navigating to a period with nothing in it doesn't get mistaken for
  // "nothing imported anywhere" and blank out the whole page.
  const [totalCounts, setTotalCounts] = useState<{ hunts: number; terror: number; md: number } | null>(null);
  const [huntTrend, setHuntTrend] = useState<PlayerTrendPoint[]>([]);
  const [terrorTrend, setTerrorTrend] = useState<PlayerTrendPoint[]>([]);
  const [mdTrend, setMdTrend] = useState<PlayerTrendPoint[]>([]);
  const [bucket, setBucket] = useState<Bucket>('week');
  // Lets the chart be narrowed to just one or two content types (e.g. "only
  // Terror") without leaving the page, instead of always blending all three.
  const [contentFilter, setContentFilter] = useState<Record<ContentKey, boolean>>({
    hunts: true,
    terror: true,
    md: true,
  });

  // The bucket toggle picks which single period the outer date filter is
  // pinned to (a day, a week, a month), but the chart itself always drills
  // one level finer than that - otherwise, with the filter already narrowed
  // to exactly one week, every point in the week collapses into a single
  // "week" bucket (that week's Monday) and the chart shows nothing useful.
  // Same pattern the Hunts/Terror/MD dashboards already use.
  const chartBucket: Bucket = bucket === 'month' ? 'week' : 'day';

  // Switching the bucket toggle pins the outer date filter to a single
  // concrete day/week/month (defaulting to whichever one is already in
  // view, or today) - otherwise the toggle changed which granularity the
  // chart *would* draw at, but the date range stayed whatever it was
  // before, so nothing visibly changed until the range was touched some
  // other way (e.g. the period navigator).
  function selectBucket(next: Bucket) {
    setBucket(next);
    setDateRange(periodRangeForDate(referenceDateFromRange(from, to), next));
  }

  // Pin to the current week on first render, same pattern as the 3
  // content-specific dashboards - only if the filter hasn't been touched yet.
  useEffect(() => {
    if (!from && !to) {
      setDateRange(periodRangeForDate(new Date(), bucket));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      api.getOverview({ player, sessionType }),
      api.getTerrorOverview({ player, sessionType }),
      api.getMdOverview({ player, sessionType }),
    ]).then(([h, t, m]) => {
      if (!ignore) setTotalCounts({ hunts: h.huntCount, terror: t.terrorCount, md: m.mdCount });
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      api.getOverview({ player, sessionType, from, to }),
      api.getTerrorOverview({ player, sessionType, from, to }),
      api.getMdOverview({ player, sessionType, from, to }),
    ]).then(([h, t, m]) => {
      if (ignore) return;
      setHuntsOverview(h);
      setTerrorOverview(t);
      setMdOverview(m);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      api.getTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }),
      api.getTerrorTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }),
      api.getMdTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }),
    ]).then(([h, t, m]) => {
      if (ignore) return;
      setHuntTrend(h);
      setTerrorTrend(t);
      setMdTrend(m);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, chartBucket]);

  // Hunts, Terror and MD are measured in incompatible units (profit/hour vs.
  // profit per rotation), so the only metric that can be combined into one
  // line per character is the straight summed profit for the period - not
  // an average/rate. Each of the 3 by-player trend endpoints already
  // returns a real summed `totalProfit` per (player, bucket), so this is a
  // pure client-side merge, no new backend endpoint needed.
  const playerSeries = useMemo(() => {
    const activeSources = [
      contentFilter.hunts ? huntTrend : [],
      contentFilter.terror ? terrorTrend : [],
      contentFilter.md ? mdTrend : [],
    ];
    const totals = new Map<string, { playerId: number; playerName: string; bucketStart: string; totalProfit: number }>();
    for (const rows of activeSources) {
      for (const row of rows) {
        const key = `${row.playerId}::${row.bucketStart}`;
        const existing = totals.get(key);
        if (existing) existing.totalProfit += row.totalProfit;
        else totals.set(key, { playerId: row.playerId, playerName: row.playerName, bucketStart: row.bucketStart, totalProfit: row.totalProfit });
      }
    }
    const byPlayer = new Map<number, { playerId: number; playerName: string; points: { bucketStart: string; totalProfit: number }[] }>();
    for (const t of totals.values()) {
      const existing = byPlayer.get(t.playerId);
      const point = { bucketStart: t.bucketStart, totalProfit: t.totalProfit };
      if (existing) existing.points.push(point);
      else byPlayer.set(t.playerId, { playerId: t.playerId, playerName: t.playerName, points: [point] });
    }
    return [...byPlayer.values()]
      .sort((a, b) => a.playerId - b.playerId)
      .map((entry, index) => ({ ...entry, color: getPlayerColor(String(entry.playerId), index) }));
  }, [huntTrend, terrorTrend, mdTrend, contentFilter, getPlayerColor]);

  if (!huntsOverview || !terrorOverview || !mdOverview || !totalCounts) {
    return <div className="empty-state">Carregando...</div>;
  }

  if (totalCounts.hunts === 0 && totalCounts.terror === 0 && totalCounts.md === 0) {
    return (
      <div>
        <h1 className="page-title">Visão Geral</h1>
        <div className="empty-state">
          Nada importado ainda. Use as abas Hunts, Terror ou MD para começar a ver os dashboards.
        </div>
      </div>
    );
  }

  const combinedProfit = huntsOverview.totalProfit + terrorOverview.totalProfit + mdOverview.totalProfit;
  const combinedExperience = huntsOverview.totalExperience + terrorOverview.totalExperience + mdOverview.totalExperience;
  const totalEvents = huntsOverview.huntCount + terrorOverview.terrorCount + mdOverview.mdCount;

  return (
    <div>
      <h1 className="page-title">Visão Geral</h1>
      <p className="page-subtitle">
        {totalEvents} evento{totalEvents === 1 ? '' : 's'} no período selecionado.
        {(from || to) && (
          <>
            {' '}
            <button
              className="secondary"
              style={{ fontSize: 11.5, padding: '2px 8px', marginLeft: 4 }}
              onClick={() => setDateRange({ from: '', to: '' })}
            >
              Limpar filtro de período
            </button>
          </>
        )}
      </p>

      <div className="stat-grid">
        <StatTile label="Horas caçadas" value={formatHours(huntsOverview.totalDurationSeconds)} />
        <StatTile label="Profit total" value={formatCompact(combinedProfit)} />
        <StatTile label="MDs realizadas" value={formatInt(mdOverview.mdCount)} />
        <StatTile label="Rotações Terror realizadas" value={formatInt(terrorOverview.terrorCount)} />
        <StatTile label="Raros total" value={formatInt(huntsOverview.totalRareKills)} />
        <StatTile label="Exp realizada" value={formatCompact(combinedExperience)} />
      </div>

      <div className="highlight-grid section" style={{ marginBottom: 24 }}>
        <div className="card">
          <h2 className="section-title">Hunt mais lucrativa</h2>
          {huntsOverview.mostProfitableHunt ? (
            <p style={highlightTextStyle}>
              <Link to={`/hunts/${huntsOverview.mostProfitableHunt.id}`}>
                {huntsOverview.mostProfitableHunt.huntName ?? 'Hunt'}
              </Link>{' '}
              ({huntsOverview.mostProfitableHunt.players.join(', ') || '—'}) em{' '}
              {formatDateTime(huntsOverview.mostProfitableHunt.startTime)} — profit de{' '}
              {formatCompact(huntsOverview.mostProfitableHunt.profit)}
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem hunts no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">Rotação mais lucrativa</h2>
          {terrorOverview.mostProfitableTerror ? (
            <p style={highlightTextStyle}>
              <Link to={`/terror/${terrorOverview.mostProfitableTerror.id}`}>
                {terrorOverview.mostProfitableTerror.terrorName ?? 'Terror'}
              </Link>{' '}
              ({terrorOverview.mostProfitableTerror.players.join(', ') || '—'}) em{' '}
              {formatDateTime(terrorOverview.mostProfitableTerror.startTime)} — profit de{' '}
              {formatCompact(terrorOverview.mostProfitableTerror.profit)}
            </p>
          ) : (
            <p style={{ ...highlightTextStyle, color: 'var(--text-muted)' }}>Sem rotações no período.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">MD mais lucrativa</h2>
          {mdOverview.mostProfitableMd ? (
            <p style={highlightTextStyle}>
              <Link to={`/md/${mdOverview.mostProfitableMd.id}`}>{mdOverview.mostProfitableMd.mdName ?? 'MD'}</Link>{' '}
              ({mdOverview.mostProfitableMd.players.join(', ') || '—'}) em{' '}
              {formatDateTime(mdOverview.mostProfitableMd.startTime)} — profit de{' '}
              {formatCompact(mdOverview.mostProfitableMd.profit)}
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
            Profit total por {CHART_BUCKET_LABEL[chartBucket]}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <PeriodNavigator bucket={bucket} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Conteúdos:</span>
          <div className="bucket-toggle">
            {CONTENT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={contentFilter[opt.key] ? '' : 'secondary'}
                onClick={() => setContentFilter((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <PlayerLegend entries={playerSeries.map((s) => ({ id: s.playerId, name: s.playerName, color: s.color }))} />
          <MultiSeriesTrendChart series={playerSeries} bucket={chartBucket} metricKey="totalProfit" />
        </div>
      </div>
    </div>
  );
}
