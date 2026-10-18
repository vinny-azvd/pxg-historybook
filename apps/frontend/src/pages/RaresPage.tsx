import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { StatTile } from '../components/StatTile';
import { ScopeBreadcrumb, useChartScope } from '../chartScope';
import { diffDays, zoomState, type ScopeState } from '../chartScope/windows';
import { PeriodRange } from '../components/PeriodRange';
import { toISODate } from '../dates';
import { RareSpeciesChart } from '../components/rares/RareSpeciesChart';
import { RareCategoryBar } from '../components/rares/RareCategoryBar';
import { RareEntryChart } from '../components/rares/RareEntryChart';
import { RareTimelineChart } from '../components/rares/RareTimelineChart';
import { RareGallery } from '../components/rares/RareGallery';
import { RareEventsTable } from '../components/rares/RareEventsTable';
import { RareTierFilter } from '../components/rares/RareTierFilter';
import { RareBadges, RareSprite, baseName } from '../components/rares/RareSprite';
import { TypeFilter } from '../components/TypeFilter';
import { FilterMenu, type FilterSummaryItem } from '../components/FilterMenu';
import { POKEMON_TYPES, pokemonTypes, typeLabel, type PokemonType } from '../pokemon';
import { SHINY_TIERS } from '../shinyTiers';
import {
  ORIGIN_LABEL,
  entryPath,
  matchesTypes,
  rareTierKey,
  showInSpeciesChart,
  teammateRareKills,
  visibleEntryRows,
} from '../components/rares/rareUtils';
import type { RareTierKey } from '../components/rares/rareUtils';
import { ShiniesTab } from './ShiniesPage';
import type { RareEvent, RaresFilters, RaresSummary } from '../api/types';
import { formatDateTime, formatHours, formatInt, formatRate, formatRelativeDate, formatShare } from '../format';

type TimeBucket = 'day' | 'week' | 'month';

// Rares here are hunt rares only: MD rares are left out of every number on the
// page (a stale ?origin= in an old link is ignored).
const ORIGIN: NonNullable<RaresFilters['origin']> = 'hunt';

// Shown with both filters: what either of them touches is the same set of sections.
const RARES_FILTER_SCOPE_NOTE =
  'Os filtros de tier e de elemento afetam só o gráfico por espécie, a galeria, a tabela, o último raro e o Raros/h por hunt; os totais e a categoria não mudam.';

// Timeline grouping when nobody picked one: from the length of the range, so a
// week reads by day and a year by month. Counts the days inclusively; a range
// with no start is "Tudo" (months), one with no end runs up to today.
const AUTO_DAY_MAX_DAYS = 45;
const AUTO_WEEK_MAX_DAYS = 200;

function autoBucket(from: string, to: string, today: string): TimeBucket {
  if (!from) return 'month';
  const end = to || today;
  if (from > end) return 'month';
  const days = diffDays(from, end) + 1;
  if (days <= AUTO_DAY_MAX_DAYS) return 'day';
  if (days <= AUTO_WEEK_MAX_DAYS) return 'week';
  return 'month';
}

const BUCKET_OPTIONS: { value: TimeBucket; label: string; title: string }[] = [
  { value: 'day', label: 'Dia', title: 'Uma coluna por dia' },
  { value: 'week', label: 'Semana', title: 'Uma coluna por semana' },
  { value: 'month', label: 'Mês', title: 'Uma coluna por mês' },
];

type RaresTab = 'geral' | 'shinies';

// Shiny hunts are stored in the browser (local mode), so that tab doesn't exist
// with the backend. The tab lives in the URL (?aba=shinies) like ?origin.
const HAS_SHINIES_TAB = import.meta.env.VITE_DATA_MODE === 'local';

export function RaresPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: RaresTab = HAS_SHINIES_TAB && searchParams.get('aba') === 'shinies' ? 'shinies' : 'geral';

  function selectTab(next: RaresTab) {
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        if (next === 'geral') updated.delete('aba');
        else updated.set('aba', next);
        return updated;
      },
      { replace: true }
    );
  }

  return (
    <div>
      <h1 className="page-title">Raros</h1>
      {HAS_SHINIES_TAB && (
        <div className="bucket-toggle" style={{ marginBottom: 16 }}>
          <button className={tab === 'geral' ? '' : 'secondary'} aria-pressed={tab === 'geral'} onClick={() => selectTab('geral')}>
            Visão geral
          </button>
          <button
            className={tab === 'shinies' ? '' : 'secondary'}
            aria-pressed={tab === 'shinies'}
            onClick={() => selectTab('shinies')}
          >
            Shinies
          </button>
        </div>
      )}
      {tab === 'shinies' ? <ShiniesTab /> : <RaresOverviewTab />}
    </div>
  );
}

function RaresOverviewTab() {
  const { player, sessionType, from, to, setDateRange } = useFilters();
  // Grouping of the timeline columns: null = automatic (from the range length).
  // A manual pick stays while the range changes, until "Automático".
  const [manualBucket, setManualBucket] = useState<TimeBucket | null>(null);
  // The manual grouping each zoom level was left with, so stepping back restores
  // the view as it was (Power BI style) instead of dropping to automatic.
  const bucketBeforeZoom = useRef<{ depth: number; bucket: TimeBucket | null }[]>([]);
  const today = toISODate(new Date());
  const chartBucket: TimeBucket = manualBucket ?? autoBucket(from, to, today);
  // What the summary on screen was requested for: a refetch keeps the previous
  // numbers (faded), and the timeline must be drawn with the bucket and range
  // its rows belong to, not the ones the controls already moved on to.
  const [loaded, setLoaded] = useState<{ summary: RaresSummary; bucket: TimeBucket; from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tier filter (none selected = every rare). Client-side only: it never goes
  // into the request, so a toggle doesn't refetch or fade the page.
  const [tiers, setTiers] = useState<ReadonlySet<RareTierKey>>(() => new Set());
  // Element filter (none selected = every element), also client-side only.
  const [types, setTypes] = useState<ReadonlySet<PokemonType>>(() => new Set());

  // The period itself is the global from/to (PeriodRange, the header filter),
  // which every section follows. The shared chart scope is only used for the
  // timeline's zoom by click/drag and its breadcrumb; it never picks the range
  // on its own here ("Tudo" on a first visit: rares are sparse). The timeline's
  // finest level is one column per day: zooming into a day keeps that column
  // and only narrows the other sections.
  const scope = useChartScope({ entryBucket: 'hunt', entryIsDay: true, defaultGranularity: 'all', zoomUnit: chartBucket });

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    api
      .getRares({ player, sessionType, from, to, origin: ORIGIN, bucket: chartBucket })
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
  }, [player, sessionType, from, to, chartBucket]);

  const summary = loaded?.summary ?? null;
  // Zoom only on a chart that matches the current range and grouping (not a stale one).
  const zoomable =
    scope.canZoom && loaded !== null && loaded.bucket === chartBucket && loaded.from === from && loaded.to === to;

  // Drilling into a bar goes back to automatic grouping: a manual "Mês" kept
  // over one single month would leave a one-column chart, and a zoom that lands
  // on the very range on screen changes nothing else, so the click would not
  // visibly refine anything.
  function zoomChart(first: string, last?: string) {
    const parent: ScopeState = { kind: 'window', gran: chartBucket, entry: false, from, to, custom: true };
    const child = zoomState(parent, today, first, last ?? first, true);
    setManualBucket(null);
    if (child && child.from === from && child.to === to) {
      return;
    }
    bucketBeforeZoom.current = [
      ...bucketBeforeZoom.current.filter((e) => e.depth < scope.depth),
      { depth: scope.depth, bucket: manualBucket },
    ];
    if (last === undefined) {
      scope.zoom(first);
    } else {
      scope.zoomSpan(first, last);
    }
  }

  // Back one zoom level (click on empty plot area of the timeline): the range
  // returns to the previous level together with the manual grouping that level had.
  function zoomOut() {
    const target = scope.depth - 1;
    const saved = bucketBeforeZoom.current.find((e) => e.depth === target);
    bucketBeforeZoom.current = bucketBeforeZoom.current.filter((e) => e.depth < target);
    setManualBucket(saved?.bucket ?? null);
    scope.goTo(target);
  }

  const hasRange = Boolean(from || to);
  // With a tier selected, only Shiny/Mega of those tiers are shown (Giant,
  // Golden... have no tier) and that REPLACES the default rule below, so
  // picking tier 2 shows tier 2. Without one, Tier 2/3 and out-of-roulette
  // Shinies stay out of the species chart and gallery; they still count in
  // every total and in the full table.
  const tierActive = tiers.size > 0;
  // Element filter on top of that (AND): a rare passes when any of its types is
  // selected; forms the Pokédex has no types for can't pass.
  const typeActive = types.size > 0;
  const filterActive = tierActive || typeActive;
  // What each closed filter button says is active (catalog order, not click order).
  const tierItems: FilterSummaryItem[] = [...SHINY_TIERS, 'out' as const]
    .filter((t) => tiers.has(t))
    .map((t) => (t === 'out' ? { label: 'Fora da roleta' } : { label: t, num: true }));
  const typeItems: FilterSummaryItem[] = POKEMON_TYPES.filter((t) => types.has(t)).map((t) => ({ label: typeLabel(t) }));
  const tierMatch = useMemo(
    () => (enemy: string) => {
      const key = rareTierKey(enemy);
      return key !== null && tiers.has(key);
    },
    [tiers]
  );
  // Tier stage only: what the page would show before the element filter.
  const tierStage = useMemo(() => (tierActive ? tierMatch : showInSpeciesChart), [tierActive, tierMatch]);
  // The single "is this rare shown" rule: species chart, gallery, last rare and
  // the Raros/h per hunt counts all use it, so they always agree.
  const visible = useMemo(
    () => (enemy: string) => tierStage(enemy) && matchesTypes(enemy, types),
    [tierStage, types]
  );
  const stagedSpecies = useMemo(() => (summary ? summary.species.filter((s) => tierStage(s.enemy)) : []), [summary, tierStage]);
  const chartSpecies = useMemo(() => stagedSpecies.filter((s) => matchesTypes(s.enemy, types)), [stagedSpecies, types]);
  const tableEvents = useMemo(
    () =>
      summary
        ? summary.events.filter((e) => (tierActive ? tierMatch(e.enemy) : true) && matchesTypes(e.enemy, types))
        : [],
    [summary, tierActive, tierMatch, types]
  );
  // Events come newest first; the last rare is the latest one of those the page shows.
  const lastRare = summary ? (summary.events.find((e) => visible(e.enemy)) ?? null) : null;
  const entryRows = useMemo(
    () => (summary ? visibleEntryRows(summary.byEntry, summary.events, visible) : { rows: [], hiddenHunts: 0 }),
    [summary, visible]
  );
  // Species the tier rule (not the element filter) leaves out of the chart.
  const hiddenSpecies = summary ? summary.species.length - stagedSpecies.length : 0;
  const hiddenKills = summary
    ? summary.species.reduce((n, s) => n + s.count, 0) - stagedSpecies.reduce((n, s) => n + s.count, 0)
    : 0;
  // Species left out of an element filter only because their types are unknown.
  const unknownTypeSpecies = typeActive ? stagedSpecies.filter((s) => pokemonTypes(s.enemy).length === 0).length : 0;
  const filterEmptyText = filterActive
    ? tierActive && typeActive
      ? 'Nenhum raro dos tiers e elementos selecionados no período.'
      : typeActive
        ? 'Nenhum raro dos elementos selecionados no período.'
        : 'Nenhum raro dos tiers selecionados no período.'
    : undefined;

  return (
    <div>
      <p className="page-subtitle">
        Pokémon raros derrotados em hunts - o que o export do jogo marca como raro.
      </p>

      <PeriodRange>
        <FilterMenu
          id="rares-filters"
          tier={{
            items: tierItems,
            panel: (
              <div className="chart-toolbar rares-filters rares-tier-filter">
                <RareTierFilter selected={tiers} onChange={setTiers} />
                <p className="rares-filter-note">
                  {RARES_FILTER_SCOPE_NOTE}
                  {tierActive && ' Raros sem tier (Giant, Golden, Cyber...) ficam ocultos enquanto houver um tier selecionado.'}
                </p>
              </div>
            ),
          }}
          element={{
            items: typeItems,
            panel: (
              <div className="chart-toolbar rares-filters rares-tier-filter">
                <TypeFilter selected={types} onChange={setTypes} />
                <p className="rares-filter-note">
                  {RARES_FILTER_SCOPE_NOTE}
                  {typeActive &&
                    ' Um Pokémon aparece se tiver qualquer um dos elementos selecionados; raros não identificados e de outros treinadores ficam de fora.'}
                  {unknownTypeSpecies > 0 &&
                    ` ${formatInt(unknownTypeSpecies)} espécie${unknownTypeSpecies === 1 ? '' : 's'} sem elemento conhecido na Pokédex ${
                      unknownTypeSpecies === 1 ? 'ficou' : 'ficaram'
                    } de fora.`}
                </p>
              </div>
            ),
          }}
          onClear={() => {
            setTiers(new Set());
            setTypes(new Set());
          }}
        />
      </PeriodRange>
      <ScopeBreadcrumb scope={scope} />

      {error && <div className="error-box">{error}</div>}

      {!summary ? (
        !error && <div className="empty-state">Carregando...</div>
      ) : (
        // A refetch keeps the previous numbers on screen, faded, instead of
        // flashing a loading placeholder and making the page jump.
        <div className={loading ? 'rares-body rares-refetching' : 'rares-body'} aria-busy={loading}>
          <RaresKpis summary={summary} lastRare={lastRare} filterActive={filterActive} />

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
                  <h2 className="section-title">Raros/h por hunt</h2>
                  <div className="card">
                    <RareEntryChart
                      entries={entryRows.rows}
                      hiddenHunts={entryRows.hiddenHunts}
                      emptyText={filterEmptyText}
                    />
                  </div>
                </section>
              </div>

              <section className="section">
                <h2 className="section-title">Linha do tempo</h2>
                <div className="chart-toolbar-group timeline-bucket" role="group" aria-labelledby="timeline-bucket-label">
                  <span className="chart-toolbar-label" id="timeline-bucket-label">
                    Agrupar por
                  </span>
                  <div className="bucket-toggle">
                    {BUCKET_OPTIONS.map((opt) => {
                      const on = chartBucket === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={on ? '' : 'secondary'}
                          aria-pressed={on}
                          title={opt.title}
                          onClick={() => setManualBucket(opt.value)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {manualBucket !== null && (
                    <button type="button" className="secondary" onClick={() => setManualBucket(null)}>
                      Automático
                    </button>
                  )}
                  <span className="rares-filter-note">Só muda as colunas da linha do tempo, não o período.</span>
                </div>
                <div className="card">
                  <RareTimelineChart
                    timeline={summary.timeline}
                    bucket={loaded!.bucket}
                    range={{ from: loaded!.from, to: loaded!.to }}
                    origin={ORIGIN}
                    onZoom={zoomable ? (start) => zoomChart(start) : undefined}
                    onZoomSpan={zoomable ? zoomChart : undefined}
                    // Click on empty plot area = back one zoom level (Power BI style).
                    onZoomOut={scope.depth > 0 ? zoomOut : undefined}
                  />
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">Raros por espécie</h2>
                <div className="card">
                  <RareSpeciesChart
                    species={chartSpecies}
                    // Unidentified and teammates' rares have no tier or element: out with any filter.
                    unidentified={filterActive ? 0 : summary.unidentifiedRareKills}
                    teammates={filterActive ? 0 : teammateRareKills(summary)}
                    emptyText={filterEmptyText}
                    typeFilter={types}
                  />
                  {!tierActive && hiddenSpecies > 0 && (
                    <p className="shinies-note">
                      {formatInt(hiddenSpecies)} espécie{hiddenSpecies === 1 ? '' : 's'} ({formatInt(hiddenKills)} raro
                      {hiddenKills === 1 ? '' : 's'}) de Shiny Tier 2, Tier 3 ou fora da roleta não aparece
                      {hiddenSpecies === 1 ? '' : 'm'} neste gráfico nem na galeria: estão na aba Shinies e em "Todos os raros".
                    </p>
                  )}
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">Galeria</h2>
                <RareGallery species={chartSpecies} emptyText={filterEmptyText} typeFilter={types} />
              </section>

              <section className="section">
                <h2 className="section-title">Todos os raros <span className="num">({formatInt(tableEvents.length)})</span></h2>
                <div className="card">
                  <RareEventsTable events={tableEvents} emptyText={filterEmptyText} />
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

function RaresKpis({ summary, lastRare, filterActive }: { summary: RaresSummary; lastRare: RareEvent | null; filterActive: boolean }) {
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
      <LastRareTile summary={summary} event={lastRare} filterActive={filterActive} />
      <StatTile
        label="Via Nightmare Crystal"
        value={formatInt(summary.nightmareCrystalRares)}
        sub={`${total > 0 ? `${formatShare(summary.nightmareCrystalRares / total)} dos raros · ` : ''}${formatInt(
          summary.nightmareCrystalsBroken
        )} cristais quebrados`}
      />
    </div>
  );
}

// StatTile only takes text; the last rare earns its sprite, so this one is
// built from the same .stat-tile pieces by hand.
function LastRareTile({ summary, event, filterActive }: { summary: RaresSummary; event: RareEvent | null; filterActive: boolean }) {
  // No event doesn't mean no rare: they may all be unidentified, or (with a
  // Treinador filter) all a teammate's - say which, next to a non-zero KPI.
  const emptyText =
    summary.totalRareKills === 0
      ? 'Nenhum no período'
      : filterActive && summary.events.length > 0
        ? 'Nenhum dos filtros selecionados'
        : summary.events.length > 0
        ? 'Nenhum Shiny T1 ou Mega'
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
            {event.legacy ? (
              <>
                {event.entryName ?? ORIGIN_LABEL[event.origin]} <span className="badge">Histórico da roleta</span>
              </>
            ) : (
              <>
                <Link to={entryPath(event.origin, event.entryId)}>{event.entryName ?? ORIGIN_LABEL[event.origin]}</Link>
                {event.entryName && ` (${ORIGIN_LABEL[event.origin]})`}
              </>
            )}
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
