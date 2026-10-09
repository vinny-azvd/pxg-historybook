// Pure window / zoom math for the chart scope (no React, no `new Date()` of its
// own: callers pass "today" as an ISO date so everything is testable).
//
// Model: a TRAIL of states. trail[0] is the ROOT window (the default window of
// a granularity: last 30 days / 12 weeks / 12 months / everything, or a custom
// range that came from the header filter). Every deeper entry is a ZOOM into
// one chart unit (a month, a week, a day) or into a dragged span of adjacent
// units. The last entry is the one whose [from, to] is the global period.
import { startOfWeek, toISODate } from '../dates';

export type Unit = 'day' | 'week' | 'month';
/** What the Tudo / Dia / Semana / Mês buttons choose: the size of one point. */
export type Granularity = 'all' | Unit;
export type EntryBucket = 'hunt' | 'md' | 'terror';

export interface ScopeState {
  kind: 'window' | 'zoom';
  /** Point size of the chart (for 'all' the points are months). */
  gran: Granularity;
  /** True when the chart shows one point per hunt/MD/terror (finer than a day). */
  entry: boolean;
  /** Empty strings = no limit (the "Tudo" window only). */
  from: string;
  to: string;
  /** window only: a range that is not the default window of `gran`. */
  custom?: boolean;
  /** zoom only: the unit(s) the range was built from, used to step siblings. */
  unit?: Unit;
  anchor?: string;
  count?: number;
}

export const DAY_WINDOW = 30;
export const WEEK_WINDOW = 12;
export const MONTH_WINDOW = 12;

// ---------- ISO date arithmetic (local dates, DST-safe) ----------

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** First day of the month `n` months away (always lands on the 1st). */
export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

export function unitStart(iso: string, unit: Unit): string {
  if (unit === 'month') return `${iso.slice(0, 7)}-01`;
  if (unit === 'week') return toISODate(startOfWeek(parseISO(iso)));
  return iso.slice(0, 10);
}

/** Last day of the unit that starts on `start`. */
export function unitEnd(start: string, unit: Unit): string {
  if (unit === 'day') return start.slice(0, 10);
  if (unit === 'week') return addDays(start, 6);
  const d = parseISO(start);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addUnits(anchor: string, unit: Unit, n: number): string {
  if (unit === 'month') return addMonths(anchor, n);
  return addDays(anchor, n * (unit === 'week' ? 7 : 1));
}

/** How many units, inclusive, from the unit starting `a` to the one starting `b`. */
export function unitsBetween(a: string, b: string, unit: Unit): number {
  if (unit === 'month') {
    const da = parseISO(a);
    const db = parseISO(b);
    return (db.getFullYear() - da.getFullYear()) * 12 + db.getMonth() - da.getMonth() + 1;
  }
  return Math.round(diffDays(a, b) / (unit === 'week' ? 7 : 1)) + 1;
}

// ---------- windows ----------

export function defaultWindow(gran: Granularity, today: string): { from: string; to: string } {
  if (gran === 'all') return { from: '', to: '' };
  if (gran === 'day') return { from: addDays(today, -(DAY_WINDOW - 1)), to: today };
  if (gran === 'week') return { from: addDays(unitStart(today, 'week'), -7 * (WEEK_WINDOW - 1)), to: today };
  return { from: addMonths(today, -(MONTH_WINDOW - 1)), to: today };
}

export function rootState(gran: Granularity, today: string): ScopeState {
  return { kind: 'window', gran, entry: false, ...defaultWindow(gran, today) };
}

/** The unit one chart point stands for. */
export function chartUnit(gran: Granularity): Unit {
  return gran === 'all' ? 'month' : gran;
}

/** Granularity for a range nobody picked a button for (header filter, a link). */
export function granularityForSpan(from: string, to: string): { gran: Granularity; entry: boolean } {
  if (!from || !to) return { gran: 'all', entry: false };
  const days = diffDays(from, to) + 1;
  if (days <= 1) return { gran: 'day', entry: true };
  if (days <= 45) return { gran: 'day', entry: false };
  if (days <= 150) return { gran: 'week', entry: false };
  return { gran: 'month', entry: false };
}

/** The root state for a range, recognising the default windows. */
export function rootForRange(from: string, to: string, today: string, preferred?: Granularity): ScopeState {
  if (!from && !to) return rootState('all', today);
  for (const g of ['day', 'week', 'month'] as const) {
    const w = defaultWindow(g, today);
    if (w.from === from && w.to === to) return rootState(g, today);
  }
  const keep = preferred && preferred !== 'all' ? preferred : null;
  // A backwards range (from after to) has nothing to infer from: show it as it is.
  if (from && to && from > to) return { kind: 'window', gran: keep ?? 'day', entry: false, from, to, custom: true };
  const inferred = granularityForSpan(from, to);
  // One single day: the points are that day's hunts/MDs/terrors (what zooming
  // into a day gives), so coming back to the page lands on the same chart.
  if (inferred.entry) return { kind: 'window', gran: 'day', entry: true, from, to, custom: true };
  // A preferred granularity is kept unless it makes no sense for the range
  // ('all' needs an open range).
  const gran = keep ?? (inferred.gran === 'all' ? 'month' : inferred.gran);
  return { kind: 'window', gran, entry: false, from, to, custom: true };
}

// ---------- zoom / shift / today ----------

/** The full span of `count` units from `anchor`, never ending after today
 * (nothing has happened there yet: no empty future slots, no future filter). */
function naturalRange(anchor: string, unit: Unit, count: number, today: string): { from: string; to: string } {
  const to = unitEnd(addUnits(anchor, unit, count - 1), unit);
  return { from: anchor, to: to > today && today >= anchor ? today : to };
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

/** Can a state zoom further? The entry level (one point per hunt/MD/terror) has
 * nothing finer - unless `entryIsDay` (the Raros page, whose finest column is
 * still a day) and the state spans more than one day. */
export function canZoomState(state: ScopeState, entryIsDay = false): boolean {
  return !state.entry || (entryIsDay && state.from !== state.to);
}

/** Zoom into the chart unit(s) from `first` to `last` (bucket start dates of the
 * current chart granularity). Returns null at the entry level (nothing finer). */
export function zoomState(
  parent: ScopeState,
  today: string,
  first: string,
  last: string = first,
  entryIsDay = false
): ScopeState | null {
  if (!canZoomState(parent, entryIsDay)) return null;
  const unit = chartUnit(parent.gran);
  let a = unitStart(first, unit);
  let b = unitStart(last, unit);
  if (a > b) [a, b] = [b, a];
  const count = unitsBetween(a, b, unit);
  const natural = naturalRange(a, unit, count, today);
  // Stay inside the parent (a month's edge week only has that month's days).
  let from = parent.from && natural.from < parent.from ? parent.from : natural.from;
  let to = parent.to && natural.to > parent.to ? parent.to : natural.to;
  if (from > to) {
    from = natural.from;
    to = natural.to;
  }
  const childGran: Granularity = unit === 'month' ? 'week' : 'day';
  return { kind: 'zoom', gran: childGran, entry: unit === 'day', from, to, unit, anchor: a, count };
}

export function canShift(state: ScopeState, dir: 1 | -1, today: string): boolean {
  if (state.from && state.to && state.from > state.to) return false;
  if (state.kind === 'zoom') {
    if (dir === -1) return true;
    return addUnits(state.anchor!, state.unit!, state.count!) <= today;
  }
  if (!state.from || !state.to) return false;
  if (dir === -1) return true;
  return state.to < today;
}

/** The previous / next sibling: a window moves by its own length, a zoom moves
 * by the unit (or the span of units) it covers. Null when it cannot move. */
export function shiftState(state: ScopeState, dir: 1 | -1, today: string): ScopeState | null {
  if (!canShift(state, dir, today)) return null;
  if (state.kind === 'zoom') {
    const anchor = addUnits(state.anchor!, state.unit!, dir * state.count!);
    return { ...state, anchor, ...naturalRange(anchor, state.unit!, state.count!, today) };
  }
  if (!state.custom && state.gran === 'month') {
    const from = addMonths(state.from, dir * MONTH_WINDOW);
    const to = unitEnd(addMonths(unitStart(state.to, 'month'), dir * MONTH_WINDOW), 'month');
    if (dir === 1 && to >= today) return rootState('month', today);
    return { ...state, from, to };
  }
  // Windows tile the timeline: the previous one ends the day before this one
  // starts (and the next starts the day after this one ends).
  const length = state.custom || state.gran === 'all' ? diffDays(state.from, state.to) + 1 : state.gran === 'day' ? DAY_WINDOW : 7 * WEEK_WINDOW;
  const next =
    dir === -1
      ? { ...state, from: addDays(state.from, -length), to: addDays(state.from, -1) }
      : { ...state, from: addDays(state.to, 1), to: minDate(addDays(state.to, length), today) };
  if (dir === 1 && next.to >= today && !state.custom) return rootState(state.gran, today);
  return next;
}

/** "Hoje": the default window of the granularity, or - zoomed - the same kind of
 * period (the unit span ending with today's). */
export function todayState(state: ScopeState, today: string): ScopeState {
  if (state.kind === 'window') return rootState(state.gran, today);
  const unit = state.unit!;
  const anchor = addUnits(unitStart(today, unit), unit, -(state.count! - 1));
  return { ...state, anchor, ...naturalRange(anchor, unit, state.count!, today) };
}

function overlaps(a: ScopeState, b: ScopeState): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/** After the LAST crumb moved sideways, keep the zoomed ancestors (not the root)
 * pointing at periods that still contain it. */
function fixAncestors(trail: ScopeState[], today: string): ScopeState[] {
  const next = [...trail];
  for (let i = next.length - 2; i >= 1; i--) {
    const parent = next[i];
    const child = next[i + 1];
    if (overlaps(parent, child)) continue;
    const unit = parent.unit!;
    const anchor = unitStart(child.from, unit);
    next[i] = { ...parent, anchor, ...naturalRange(anchor, unit, parent.count!, today) };
  }
  return next;
}

export function shiftTrail(trail: ScopeState[], dir: 1 | -1, today: string): ScopeState[] | null {
  const moved = shiftState(trail[trail.length - 1], dir, today);
  if (!moved) return null;
  return fixAncestors([...trail.slice(0, -1), moved], today);
}

export function todayTrail(trail: ScopeState[], today: string): ScopeState[] {
  const last = trail[trail.length - 1];
  if (last.kind === 'window') return [todayState(last, today)];
  return fixAncestors([...trail.slice(0, -1), todayState(last, today)], today);
}

export function zoomTrail(
  trail: ScopeState[],
  today: string,
  first: string,
  last?: string,
  entryIsDay = false
): ScopeState[] | null {
  const child = zoomState(trail[trail.length - 1], today, first, last, entryIsDay);
  return child ? [...trail, child] : null;
}

// ---------- labels ----------

/** What one chart point is called in a chart title ("Profit por semana"). */
export function bucketNoun(bucket: string, entryNoun: string): string {
  return bucket === 'day' ? 'dia' : bucket === 'week' ? 'semana' : bucket === 'month' ? 'mês' : entryNoun;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function monthShort(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
}

function dm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function dmy(iso: string): string {
  return `${dm(iso)}/${iso.slice(0, 4)}`;
}

/** "10/09–09/10", with the years when the range leaves the current year.
 * Open ends (a header date field cleared) read "desde 20/07" / "até 05/10". */
export function shortRange(from: string, to: string, today: string): string {
  const withYear = [from, to].some((d) => d && d.slice(0, 4) !== today.slice(0, 4));
  const fmt = (iso: string) => (withYear ? dmy(iso) : dm(iso));
  if (!from && !to) return 'Todo o período';
  if (!to) return `desde ${fmt(from)}`;
  if (!from) return `até ${fmt(to)}`;
  if (from === to) return fmt(from);
  return `${fmt(from)}–${fmt(to)}`;
}

/** Text of one breadcrumb. */
export function crumbLabel(state: ScopeState, today: string): string {
  if (state.kind === 'window') {
    if (state.custom) return shortRange(state.from, state.to, today);
    const current = state.to === today;
    if (state.gran === 'all') return 'Tudo';
    if (state.gran === 'day') return current ? `Últimos ${DAY_WINDOW} dias` : `${DAY_WINDOW} dias`;
    if (state.gran === 'week') return `${WEEK_WINDOW} semanas`;
    return `${MONTH_WINDOW} meses`;
  }
  const { unit, anchor, count } = state;
  if (unit === 'month') {
    if (count === 1) return monthShort(anchor!);
    return `${monthShort(anchor!)}–${monthShort(addMonths(anchor!, count! - 1))}`;
  }
  return shortRange(state.from, state.to, today);
}

/** The line next to the arrows: what range is on screen. */
export function scopeLabel(state: ScopeState, today: string): string {
  if (state.kind === 'window') {
    if (state.gran === 'all' && !state.custom) return 'Todo o período';
    const range = shortRange(state.from, state.to, today);
    if (state.custom) return `Período · ${range}`;
    const current = state.to === today;
    if (state.gran === 'day') return `${current ? 'Últimos ' : ''}${DAY_WINDOW} dias · ${range}`;
    if (state.gran === 'week') return `${WEEK_WINDOW} semanas · ${range}`;
    return `${MONTH_WINDOW} meses · ${monthShort(state.from)}–${monthShort(state.to)}`;
  }
  const { unit, anchor, count } = state;
  if (count === 1) {
    if (unit === 'month') return `${MONTHS_LONG[Number(anchor!.slice(5, 7)) - 1]} de ${anchor!.slice(0, 4)}`;
    if (unit === 'week') return `Semana · ${shortRange(state.from, state.to, today)}`;
    return `Dia · ${dmy(anchor!)}`;
  }
  if (unit === 'month') return `Seleção · ${crumbLabel(state, today)}`;
  return `Seleção · ${shortRange(state.from, state.to, today)}`;
}
