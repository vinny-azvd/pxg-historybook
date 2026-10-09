import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { StatTile } from '../components/StatTile';
import { ScopeBreadcrumb, ScopeToolbar, useChartScope } from '../chartScope';
import { RareSpeciesChart } from '../components/rares/RareSpeciesChart';
import { RareCategoryBar } from '../components/rares/RareCategoryBar';
import { RareEntryChart } from '../components/rares/RareEntryChart';
import { RareTimelineChart } from '../components/rares/RareTimelineChart';
import { RareGallery } from '../components/rares/RareGallery';
import { RareEventsTable } from '../components/rares/RareEventsTable';
import { RareBadges, RareSprite, baseName } from '../components/rares/RareSprite';
import { ORIGIN_LABEL, entryPath, teammateRareKills } from '../components/rares/rareUtils';
import type { RaresFilters, RaresSummary } from '../api/types';
import { formatDateTime, formatHours, formatInt, formatRate, formatRelativeDate, formatShare } from '../format';

type TimeBucket = 'day' | 'week' | 'month';
type Origin = NonNullable<RaresFilters['origin']>;

// Origin lives in the URL (?origin=hunt|md) so a link can open the page
// already narrowed - the Hunts dashboard sends ?origin=hunt so the total here
// matches its own "Raros total" - and a reload keeps it.
function parseOrigin(value: string | null): Origin {
  return value === 'hunt' || value === 'md' ? value : 'all';
}

const ORIGIN_OPTIONS: { value: Origin; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'hunt', label: 'Hunts' },
  { value: 'md', label: 'MD' },
];

export function RaresPage() {
  const { player, sessionType, from, to } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const origin = parseOrigin(searchParams.get('origin'));
  // What the summary on screen was requested for: a refetch keeps the previous
  // numbers (faded), and the timeline must be drawn with the bucket and range
  // its rows belong to, not the ones the toolbar already moved on to.
  const [loaded, setLoaded] = useState<{ summary: RaresSummary; bucket: TimeBucket; from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The period controls are the shared chart scope (granularity, moving window,
  // zoom by click/drag, breadcrumb); the global from/to stays the source of
  // truth, so every section below follows the visible range. The timeline's
  // finest level is one column per day: zooming into a day keeps that column
  // and only narrows the other sections.
  const scope = useChartScope({ entryBucket: 'hunt', entryIsDay: true });
  const chartBucket: TimeBucket = scope.isEntryLevel ? 'day' : (scope.chartBucket as TimeBucket);
  // The hook writes the range into the global filter right after it changes;
  // wait for the two to agree instead of fetching an in-between range.
  const inSync = from === scope.range.from && to === scope.range.to;

  function selectOrigin(next: Origin) {
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        if (next === 'all') updated.delete('origin');
        else updated.set('origin', next);
        return updated;
      },
      { replace: true }
    );
  }

  useEffect(() => {
    if (!inSync) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    api
      .getRares({ player, sessionType, from, to, origin, bucket: chartBucket })
      .then((res) => {
        if (!ignore) setLoaded({ summary: res, bucket: chartBucket, from, to });
      })
      .catch((err: unknown) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Erro ao carregar os raros.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, origin, chartBucket, inSync]);

  const summary = loaded?.summary ?? null;
  // Zoom only on a chart that matches the current scope (not a stale one).
  const zoomable =
    scope.canZoom && loaded !== null && loaded.bucket === chartBucket && loaded.from === from && loaded.to === to;

  const hasRange = Boolean(from || to);

  return (
    <div>
      <h1 className="page-title">Raros</h1>
      <p className="page-subtitle">
        Pokémon raros derrotados em hunts e MDs - o que o export do jogo marca como raro.
      </p>

      <div className="chart-toolbar rares-filters">
        <div className="chart-toolbar-group">
          <span className="chart-toolbar-label">Período</span>
          <ScopeToolbar scope={scope} />
        </div>
        <div className="chart-toolbar-group">
          <span className="chart-toolbar-label">Origem</span>
          <div className="bucket-toggle">
            {ORIGIN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={origin === opt.value ? '' : 'secondary'}
                aria-pressed={origin === opt.value}
                onClick={() => selectOrigin(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ScopeBreadcrumb scope={scope} />

      {error && <div className="error-box">{error}</div>}

      {!summary ? (
        !error && <div className="empty-state">Carregando...</div>
      ) : (
        // A refetch keeps the previous numbers on screen, faded, instead of
        // flashing a loading placeholder and making the page jump.
        <div className={loading ? 'rares-body rares-refetching' : 'rares-body'} aria-busy={loading}>
          <RaresKpis summary={summary} origin={origin} />

          {summary.totalRareKills === 0 && summary.events.length === 0 ? (
            <div className="card empty-state">
              <p style={{ margin: '0 0 12px' }}>
                Nenhum raro no período
                {summary.sessions > 0 &&
                  ` - ${formatInt(summary.sessions)} sess${summary.sessions === 1 ? 'ão' : 'ões'} em ${formatHours(summary.totalDurationSeconds)} sem nenhum`}
                .
              </p>
              {hasRange && (
                <button className="secondary" onClick={() => scope.setGranularity('all')}>
                  Ver todo o período
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="rares-grid">
                <section className="section rares-span-2">
                  <h2 className="section-title">Raros por espécie</h2>
                  <div className="card">
                    <RareSpeciesChart
                      species={summary.species}
                      unidentified={summary.unidentifiedRareKills}
                      teammates={teammateRareKills(summary)}
                    />
                  </div>
                </section>

                <section className="section">
                  <h2 className="section-title">Por categoria</h2>
                  <div className="card">
                    <RareCategoryBar
                      species={summary.species}
                      unidentified={summary.unidentifiedRareKills}
                      teammates={teammateRareKills(summary)}
                    />
                  </div>
                </section>

                {origin !== 'md' && (
                  <section className="section">
                    <h2 className="section-title">Raros/h por hunt</h2>
                    <div className="card">
                      <RareEntryChart entries={summary.byEntry} />
                    </div>
                  </section>
                )}
              </div>

              <section className="section">
                <h2 className="section-title">Linha do tempo</h2>
                <div className="card">
                  <RareTimelineChart
                    timeline={summary.timeline}
                    bucket={loaded!.bucket}
                    range={{ from: loaded!.from, to: loaded!.to }}
                    origin={origin}
                    onZoom={zoomable ? scope.zoom : undefined}
                    onZoomSpan={zoomable ? scope.zoomSpan : undefined}
                  />
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">Galeria</h2>
                <RareGallery species={summary.species} />
              </section>

              <section className="section">
                <h2 className="section-title">Todos os raros <span className="num">({formatInt(summary.events.length)})</span></h2>
                <div className="card">
                  <RareEventsTable events={summary.events} />
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const NO_SESSIONS = 'Nenhuma sessão no período';

// "72 identificados · 3 não identificados · 2 de outros treinadores": the
// parts add up to the total when some rares can't be shown by species.
function totalBreakdown(summary: RaresSummary): string {
  if (summary.sessions === 0) return NO_SESSIONS;
  const unidentified = summary.unidentifiedRareKills;
  const teammates = teammateRareKills(summary);
  if (unidentified === 0 && teammates === 0) {
    return `${formatInt(summary.sessionsWithRares)} de ${formatInt(summary.sessions)} sessões com raro`;
  }
  return [
    `${formatInt(summary.identifiedRareKills)} identificados`,
    unidentified > 0 && `${formatInt(unidentified)} não identificados`,
    teammates > 0 && `${formatInt(teammates)} de outros treinadores`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function RaresKpis({ summary, origin }: { summary: RaresSummary; origin: Origin }) {
  const total = summary.totalRareKills;
  const perRare = total >= 3 ? summary.totalDurationSeconds / total : null;
  return (
    <div className="stat-grid">
      <StatTile label="Raros no período" value={formatInt(total)} sub={totalBreakdown(summary)} />
      <StatTile
        label="Raros/h"
        value={formatRate(summary.rareKillsPerHour)}
        // "1 a cada X" from one or two rares would be noise dressed as a rate.
        sub={
          summary.sessions === 0
            ? NO_SESSIONS
            : perRare !== null
              ? `1 a cada ${formatHours(perRare)}`
              : `em ${formatHours(summary.totalDurationSeconds)} de jogo`
        }
      />
      <LastRareTile summary={summary} />
      {origin === 'md' ? (
        <StatTile label="Via Nightmare Crystal" value="—" sub="Só é anotado em hunts" />
      ) : (
        <StatTile
          label="Via Nightmare Crystal"
          value={formatInt(summary.nightmareCrystalRares)}
          sub={`${total > 0 ? `${formatShare(summary.nightmareCrystalRares / total)} dos raros · ` : ''}${formatInt(
            summary.nightmareCrystalsBroken
          )} cristais quebrados`}
        />
      )}
    </div>
  );
}

// StatTile only takes text; the last rare earns its sprite, so this one is
// built from the same .stat-tile pieces by hand.
function LastRareTile({ summary }: { summary: RaresSummary }) {
  const event = summary.lastRare;
  // No event doesn't mean no rare: they may all be unidentified, or (with a
  // Treinador filter) all a teammate's - say which, next to a non-zero KPI.
  const emptyText =
    summary.totalRareKills === 0
      ? 'Nenhum no período'
      : summary.unidentifiedRareKills > 0
        ? 'Nenhum com espécie identificada'
        : 'Nenhum deste Treinador';
  return (
    <div className="stat-tile">
      <span className="label">Último raro</span>
      {event ? (
        <>
          <span className="value rares-last-value">
            <RareSprite name={event.enemy} size={40} />
            <span className="rares-last-name" title={event.enemy}>
              {baseName(event.enemy)}
            </span>
          </span>
          <span className="sub">
            <RareBadges name={event.enemy} nightmareCrystal={event.fromNightmareCrystal} />{' '}
            <span title={formatDateTime(event.startTime)}>{formatRelativeDate(event.startTime)}</span> ·{' '}
            <Link to={entryPath(event.origin, event.entryId)}>{event.entryName ?? ORIGIN_LABEL[event.origin]}</Link>
            {event.entryName && ` (${ORIGIN_LABEL[event.origin]})`}
          </span>
        </>
      ) : (
        <>
          <span className="value">—</span>
          <span className="sub">{emptyText}</span>
        </>
      )}
    </div>
  );
}
