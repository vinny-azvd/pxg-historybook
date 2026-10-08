import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { StatTile } from '../components/StatTile';
import { PeriodNavigator } from '../components/PeriodNavigator';
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
import { inferPeriodScope, periodRangeForDate, type PeriodScope } from '../dates';

type Bucket = 'all' | 'day' | 'week' | 'month';
type Origin = NonNullable<RaresFilters['origin']>;

// Origin lives in the URL (?origin=hunt|md) so a link can open the page
// already narrowed - the Hunts dashboard sends ?origin=hunt so the total here
// matches its own "Raros total" - and a reload keeps it.
function parseOrigin(value: string | null): Origin {
  return value === 'hunt' || value === 'md' ? value : 'all';
}

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

const ORIGIN_OPTIONS: { value: Origin; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'hunt', label: 'Hunts' },
  { value: 'md', label: 'MD' },
];

// The timeline drills one level finer than the period being browsed (a month
// shows its weeks, a week its days); "Tudo" uses weeks, which keeps a few
// months of play readable. A custom range picks by its length.
function timelineBucket(bucket: PeriodScope, from: string, to: string): 'day' | 'week' | 'month' {
  if (bucket === 'all' || bucket === 'month') return 'week';
  if (bucket === 'week' || bucket === 'day') return 'day';
  const days = from && to ? (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000 : 365;
  return days <= 31 ? 'day' : days <= 190 ? 'week' : 'month';
}

export function RaresPage() {
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const origin = parseOrigin(searchParams.get('origin'));
  const [summary, setSummary] = useState<RaresSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The toggle is read off the shared from/to range instead of kept as local
  // state, so it stays right when the range changes elsewhere (header filter,
  // another dashboard pinning the current week); a range that isn't exactly
  // one day/week/month lights no button.
  const bucket = inferPeriodScope(from, to);
  const chartBucket = timelineBucket(bucket, from, to);

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

  function selectBucket(next: Bucket) {
    if (next === 'all') setDateRange({ from: '', to: '' });
    else setDateRange(periodRangeForDate(new Date(), next));
  }

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    api
      .getRares({ player, sessionType, from, to, origin, bucket: chartBucket })
      .then((res) => {
        if (!ignore) setSummary(res);
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
  }, [player, sessionType, from, to, origin, chartBucket]);

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
          <div className="bucket-toggle">
            {BUCKET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={bucket === opt.value ? '' : 'secondary'}
                aria-pressed={bucket === opt.value}
                onClick={() => selectBucket(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(bucket === 'day' || bucket === 'week' || bucket === 'month') && <PeriodNavigator bucket={bucket} />}
          {bucket === 'custom' && <span className="rares-filter-note">Período personalizado (filtro do topo)</span>}
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
                <button className="secondary" onClick={() => setDateRange({ from: '', to: '' })}>
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

                <section className="section">
                  <h2 className="section-title">Raros/h por {origin === 'md' ? 'MD' : origin === 'hunt' ? 'hunt' : 'hunt e MD'}</h2>
                  <div className="card">
                    <RareEntryChart entries={summary.byEntry} showOrigin={origin === 'all'} />
                  </div>
                </section>
              </div>

              <section className="section">
                <h2 className="section-title">Linha do tempo</h2>
                <div className="card">
                  <RareTimelineChart
                    timeline={summary.timeline}
                    bucket={chartBucket}
                    range={{ from, to }}
                    scope={bucket}
                    origin={origin}
                  />
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">Galeria</h2>
                <RareGallery species={summary.species} />
              </section>

              <section className="section">
                <h2 className="section-title">Todos os raros ({formatInt(summary.events.length)})</h2>
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
