import { useCallback, useEffect, useRef, useState } from 'react';
import { useFilters } from '../FiltersContext';
import { toISODate } from '../dates';
import {
  canShift,
  canZoomState,
  chartUnit,
  crumbLabel,
  rootForRange,
  rootState,
  scopeLabel,
  shiftTrail,
  todayTrail,
  zoomTrail,
  type EntryBucket,
  type Granularity,
  type ScopeState,
  type Unit,
} from './windows';

export interface ScopeCrumb {
  key: string;
  label: string;
}

export interface ChartScope {
  /** The Tudo / Dia / Semana / Mês button that is on (the chart's point size). */
  granularity: Granularity;
  /** What to request from the trends endpoints: a time bucket, or - zoomed down to
   * a day or a short selection - one point per hunt/MD/terror. */
  chartBucket: Unit | EntryBucket;
  /** One point per hunt/MD/terror (nothing finer to zoom into). */
  isEntryLevel: boolean;
  /** The visible range (empty strings for "Tudo"): the same as the global period filter. */
  range: { from: string; to: string };
  /** Zoom into the period of one point (bucketStart as the chart reports it). */
  zoom: (bucketStart: string) => void;
  /** Zoom into a dragged span of adjacent points (first <= last). */
  zoomSpan: (first: string, last: string) => void;
  /** Pick a granularity: applies its default window (Tudo clears the range). */
  setGranularity: (granularity: Granularity) => void;
  /** Back to a breadcrumb (0 = the window the trail started from). */
  goTo: (index: number) => void;
  /** Previous / next window (or sibling period when zoomed). */
  shift: (direction: 1 | -1) => void;
  /** Default window of the granularity (zoomed: today's period). */
  today: () => void;
  /** "Últimos 30 dias · 10/09–09/10", "12 semanas · …", the zoomed period... */
  label: string;
  crumbs: ScopeCrumb[];
  /** Zoom depth: 0 = not zoomed. */
  depth: number;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The chart can zoom (it is not at the one-point-per-entry level). */
  canZoom: boolean;
}

interface Options {
  /** Name of the per-entry bucket on the page's trends endpoint. */
  entryBucket?: EntryBucket;
  /** Granularity of a first visit with no period chosen anywhere yet. */
  defaultGranularity?: Granularity;
  /** The chart's finest column is a day (Raros): a dragged span of days can still
   * be zoomed into one of its days. */
  entryIsDay?: boolean;
  /** The page draws its chart with a point size of its own (Raros' "Agrupar por")
   * instead of the one the granularity implies: a click on a column is then a
   * bucket of THIS unit, not of the trail's. Leave out to keep the default. */
  zoomUnit?: Unit;
}

const todayISO = () => toISODate(new Date());

// Pages come and go but the zoom should survive navigating between them: the
// period itself already does (FiltersContext), the trail is rebuilt from it when
// it is still the range the last trail ended on, otherwise it is derived.
let rememberedTrail: ScopeState[] | null = null;
// The default window goes into the filter on the very first visit only; after
// that an empty filter is a deliberate "Todo o período" and must stay that way.
let sessionStarted = false;

function initialTrail(from: string, to: string, defaultGranularity: Granularity): ScopeState[] {
  const today = todayISO();
  const last = rememberedTrail?.[rememberedTrail.length - 1];
  if (rememberedTrail && last && last.from === from && last.to === to) return rememberedTrail;
  if (!from && !to) return [rootState(sessionStarted ? 'all' : defaultGranularity, today)];
  return [rootForRange(from, to, today)];
}

/**
 * Scope of a page's comparison chart: which granularity it shows, which window of
 * time, and how the user zoomed into it. The global period filter
 * (FiltersContext from/to) stays the single source of truth for the visible range:
 * every action here writes it, and a change that comes from elsewhere (the header
 * filter, another page) keeps the granularity but resets the zoom trail.
 */
export function useChartScope({ entryBucket = 'hunt', defaultGranularity = 'week', entryIsDay = false, zoomUnit }: Options = {}): ChartScope {
  const { from, to, setDateRange } = useFilters();

  const [trail, setTrail] = useState<ScopeState[]>(() => initialTrail(from, to, defaultGranularity));
  const current = trail[trail.length - 1];
  const focusPending = useRef(false);

  useEffect(() => {
    rememberedTrail = trail;
    sessionStarted = true;
  }, [trail]);

  // A zoom (or a step back out of it) can unmount the very control that was
  // used (a breadcrumb button turns into plain text), which drops keyboard
  // focus on <body>. Park it on the visible range label instead.
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    document.querySelector<HTMLElement>('[data-scope-focus]')?.focus({ preventScroll: true });
  }, [trail]);

  // The range this hook last wrote, to tell its own changes from outside ones.
  const applied = useRef({ from: current.from, to: current.to });
  const lastSeen = useRef({ from, to });

  // First visit with no period set anywhere: put the default window in the filter.
  useEffect(() => {
    if (current.from !== from || current.to !== to) setDateRange({ from: current.from, to: current.to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastSeen.current.from === from && lastSeen.current.to === to) return;
    lastSeen.current = { from, to };
    if (applied.current.from === from && applied.current.to === to) return;
    // Changed from outside: keep the granularity, start a fresh trail.
    applied.current = { from, to };
    const kept = current.gran === 'all' ? undefined : current.gran;
    setTrail([rootForRange(from, to, todayISO(), kept)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const commit = useCallback(
    (next: ScopeState[] | null) => {
      if (!next) return;
      const last = next[next.length - 1];
      applied.current = { from: last.from, to: last.to };
      setTrail(next);
      setDateRange({ from: last.from, to: last.to });
    },
    [setDateRange]
  );

  // Zooms into what the chart shows: with a zoomUnit the parent is read at that
  // unit, but only the new child is kept (the trail's own states, and so their
  // breadcrumb labels, stay as they were).
  const zoomInto = useCallback(
    (first: string, last?: string) => {
      const parent = trail[trail.length - 1];
      const read = zoomUnit && !parent.entry ? [...trail.slice(0, -1), { ...parent, gran: zoomUnit }] : trail;
      const next = zoomTrail(read, todayISO(), first, last, entryIsDay);
      return next ? [...trail, next[next.length - 1]] : null;
    },
    [trail, zoomUnit, entryIsDay]
  );
  const zoom = useCallback(
    (bucketStart: string) => {
      focusPending.current = true;
      commit(zoomInto(bucketStart));
    },
    [commit, zoomInto]
  );
  const zoomSpan = useCallback(
    (first: string, last: string) => {
      focusPending.current = true;
      commit(zoomInto(first, last));
    },
    [commit, zoomInto]
  );
  const setGranularity = useCallback(
    (granularity: Granularity) => {
      commit([rootState(granularity, todayISO())]);
    },
    [commit]
  );
  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= trail.length - 1) return;
      focusPending.current = true;
      commit(trail.slice(0, index + 1));
    },
    [commit, trail]
  );
  const shift = useCallback((direction: 1 | -1) => commit(shiftTrail(trail, direction, todayISO())), [commit, trail]);
  const today = useCallback(() => commit(todayTrail(trail, todayISO())), [commit, trail]);

  const todayIso = todayISO();
  return {
    granularity: current.gran,
    chartBucket: current.entry ? entryBucket : chartUnit(current.gran),
    isEntryLevel: current.entry,
    range: { from: current.from, to: current.to },
    zoom,
    zoomSpan,
    setGranularity,
    goTo,
    shift,
    today,
    label: scopeLabel(current, todayIso),
    crumbs: trail.map((state, index) => ({ key: `${index}:${state.from}:${state.to}`, label: crumbLabel(state, todayIso) })),
    depth: trail.length - 1,
    canGoBack: canShift(current, -1, todayIso),
    canGoForward: canShift(current, 1, todayIso),
    canZoom: canZoomState(current, entryIsDay),
  };
}
