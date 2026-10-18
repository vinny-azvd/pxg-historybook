import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { usePreferences } from '../PreferencesContext';
import { usePlayerColor } from '../playerColors';
import { StatTile } from '../components/StatTile';
import { PlayerLegend } from '../components/PlayerLegend';
import { PeriodCards } from '../components/themes/PeriodCards';
import { ScopeBreadcrumb, ScopeToolbar, bucketNoun, useChartScope } from '../chartScope';
import { MultiSeriesTrendChart, type PointDetail } from '../components/charts/MultiSeriesTrendChart';
import type { MdOverviewStats, OverviewStats, PlayerTrendPoint, TerrorOverviewStats } from '../api/types';
import { formatCompact, formatDateTime, formatHours, formatInt } from '../format';

type ContentKey = 'hunts' | 'terror' | 'md';

// Name of the per-entry bucket on each content's trends endpoint, and how a
// single entry is called in the chart (tooltip / table) once zoomed down to it.
const ENTRY_BUCKET = { terror: 'terror', md: 'md' } as const;
const ENTRY_LABEL: Record<ContentKey, string> = { hunts: 'Hunt', terror: 'Terror', md: 'MD' };


const CONTENT_OPTIONS: { key: ContentKey; label: string }[] = [
  { key: 'hunts', label: 'Hunts' },
  { key: 'terror', label: 'Terror' },
  { key: 'md', label: 'MD' },
];

// Reserves room for 2 lines so the highlight cards don't change height
// depending on whether their text wraps or is a short one-liner.
const highlightTextStyle: CSSProperties = { margin: 0, fontSize: 14, minHeight: 40, lineHeight: '20px' };

export function OverviewPage() {
  const { player, sessionType, from, to } = useFilters();
  const { rareDropThreshold } = usePreferences();
  const getPlayerColor = usePlayerColor();
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
  // Granularity, window and zoom of the chart (see chartScope). One point per
  // hunt/terror/MD once zoomed down to a day or a short selection.
  const scope = useChartScope({ entryBucket: 'hunt' });
  const chartBucket = scope.chartBucket as 'day' | 'week' | 'month' | 'hunt';
  // The bucket and range the loaded trend rows are for: a granularity switch or
  // a step with the arrows must not plot the old rows under the new axis labels.
  const [trendBucket, setTrendBucket] = useState<string | null>(null);
  // Lets the chart be narrowed to just one or two content types (e.g. "only
  // Terror") without leaving the page, instead of always blending all three.
  const [contentFilter, setContentFilter] = useState<Record<ContentKey, boolean>>({
    hunts: true,
    terror: true,
    md: true,
  });

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

  const entry = scope.isEntryLevel;

  useEffect(() => {
    let ignore = false;
    Promise.all([
      api.getTrendsByPlayer({ player, sessionType, from, to, bucket: chartBucket }),
      api.getTerrorTrendsByPlayer({ player, sessionType, from, to, bucket: entry ? ENTRY_BUCKET.terror : chartBucket }),
      api.getMdTrendsByPlayer({ player, sessionType, from, to, bucket: entry ? ENTRY_BUCKET.md : chartBucket }),
    ]).then(([h, t, m]) => {
      if (ignore) return;
      setHuntTrend(h);
      setTerrorTrend(t);
      setMdTrend(m);
      setTrendBucket(`${chartBucket}:${from}:${to}`);
    });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, chartBucket, entry]);

  // Hunts, Terror and MD are measured in incompatible units (profit/hour vs.
  // profit per rotation), so the only metric that can be combined into one
  // line per character is the straight summed profit for the period - not
  // an average/rate. Each of the 3 by-player trend endpoints already
  // returns a real summed `totalProfit` per (player, bucket), so this is a
  // pure client-side merge, no new backend endpoint needed. Each content's
  // share (and the names behind it) is kept as a detail line for the tooltip.
  const playerSeries = useMemo(() => {
    const activeSources = [
      { key: 'hunts' as ContentKey, label: 'Hunts', rows: contentFilter.hunts ? huntTrend : [] },
      { key: 'terror' as ContentKey, label: 'Terror', rows: contentFilter.terror ? terrorTrend : [] },
      { key: 'md' as ContentKey, label: 'MD', rows: contentFilter.md ? mdTrend : [] },
    ];
    const totals = new Map<
      string,
      {
        playerId: number;
        playerName: string;
        bucketStart: string;
        totalProfit: number;
        huntName: string | null;
        details: PointDetail[];
      }
    >();
    for (const { key: source, label, rows } of activeSources) {
      for (const row of rows) {
        const key = `${row.playerId}::${row.bucketStart}`;
        const detail = { label, value: row.totalProfit, names: row.names, topDrops: row.topDrops };
        // Zoomed down to single entries each point is one hunt/terror/MD: its
        // name says which content it came from ("MD · Cyber World").
        const entryName = scope.isEntryLevel ? `${ENTRY_LABEL[source]}${row.huntName ? ` · ${row.huntName}` : ''}` : null;
        const existing = totals.get(key);
        if (existing) {
          existing.totalProfit += row.totalProfit;
          existing.details.push(detail);
          if (entryName) existing.huntName = existing.huntName ? `${existing.huntName} + ${entryName}` : entryName;
        } else {
          totals.set(key, {
            playerId: row.playerId,
            playerName: row.playerName,
            bucketStart: row.bucketStart,
            totalProfit: row.totalProfit,
            huntName: entryName,
            details: [detail],
          });
        }
      }
    }
    const byPlayer = new Map<
      number,
      { playerId: number; playerName: string; points: { bucketStart: string; totalProfit: number; huntName: string | null; details: PointDetail[] }[] }
    >();
    for (const t of totals.values()) {
      const existing = byPlayer.get(t.playerId);
      const point = { bucketStart: t.bucketStart, totalProfit: t.totalProfit, huntName: t.huntName, details: t.details };
      if (existing) existing.points.push(point);
      else byPlayer.set(t.playerId, { playerId: t.playerId, playerName: t.playerName, points: [point] });
    }
    return [...byPlayer.values()]
      .sort((a, b) => a.playerId - b.playerId)
      .map((entry) => ({ ...entry, color: getPlayerColor(entry.playerId) }));
  }, [huntTrend, terrorTrend, mdTrend, contentFilter, getPlayerColor, scope.isEntryLevel]);

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
              onClick={() => scope.setGranularity('all')}
            >
              Ver todo o período
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
        <div className="scope-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            Profit total por {bucketNoun(chartBucket, 'evento')}
          </h2>
          <ScopeToolbar scope={scope} />
        </div>
        <ScopeBreadcrumb scope={scope} />
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
          {trendBucket !== `${chartBucket}:${from}:${to}` ? (
            <div className="chart-empty-state">Carregando...</div>
          ) : (
            <MultiSeriesTrendChart
              series={playerSeries}
              bucket={chartBucket}
              range={scope.range}
              metricKey="totalProfit"
              rareDropThreshold={rareDropThreshold}
              onZoom={scope.canZoom ? scope.zoom : undefined}
              onZoomSpan={scope.canZoom ? scope.zoomSpan : undefined}
              onZoomOut={scope.depth > 0 ? () => scope.goTo(scope.depth - 1) : undefined}
            />
          )}
        </div>
      </div>

      {/* Zoomed down to single entries: what happened in that period, per content
          (only the contents that have something there, so no empty lists). */}
      {scope.isEntryLevel && contentFilter.hunts && huntsOverview.huntCount > 0 && (
        <PeriodCards kind="hunt" entryLevel periodLabel={scope.label} />
      )}
      {scope.isEntryLevel && contentFilter.terror && terrorOverview.terrorCount > 0 && (
        <PeriodCards kind="terror" entryLevel periodLabel={scope.label} />
      )}
      {scope.isEntryLevel && contentFilter.md && mdOverview.mdCount > 0 && (
        <PeriodCards kind="md" entryLevel periodLabel={scope.label} />
      )}
    </div>
  );
}
