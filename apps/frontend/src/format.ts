// pt-BR throughout: decimal comma and dot thousands. Mixing "1.34M" (dot as
// decimal) next to "9.812" (dot as thousands) on the same screen was ambiguous.
const LOCALE = 'pt-BR';

const decimalFormatters = new Map<number, Intl.NumberFormat>();
function decimal(value: number, maxDigits: number, minDigits = 0): string {
  const key = maxDigits * 10 + minDigits;
  let formatter = decimalFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
    decimalFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

const isMissing = (value: number | null | undefined): value is null | undefined =>
  value === null || value === undefined || Number.isNaN(value);

// Precision shrinks as the number grows so every value stays ~3 significant
// digits: "1,34M", "24,6M", "268M" - and "58,3K" but "480K".
const COMPACT_UNITS = [
  { size: 1e3, suffix: 'K', digits: (scaled: number) => (scaled < 100 ? 1 : 0) },
  { size: 1e6, suffix: 'M', digits: (scaled: number) => (scaled < 10 ? 2 : scaled < 100 ? 1 : 0) },
  { size: 1e9, suffix: 'B', digits: (scaled: number) => (scaled < 10 ? 2 : scaled < 100 ? 1 : 0) },
];

const roundTo = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Short form for big values (profit, exp, prices): "1,34M", "480K", "950". */
export function formatCompact(value: number | null | undefined): string {
  if (isMissing(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (Math.round(abs) < 1000) return `${sign}${Math.round(abs)}`;
  // Rounding can carry a value into the next unit (999.950 -> "1000K"), so
  // walk up the units until the rounded figure fits below 1000.
  for (let i = 0; i < COMPACT_UNITS.length; i++) {
    const unit = COMPACT_UNITS[i];
    const scaled = abs / unit.size;
    const digits = unit.digits(scaled);
    const rounded = roundTo(scaled, digits);
    if (rounded < 1000 || i === COMPACT_UNITS.length - 1) {
      return `${sign}${decimal(rounded, digits)}${unit.suffix}`;
    }
  }
  return `${sign}${decimal(abs, 0)}`;
}

/** The exact value behind a compact one ("1.340.000"), for tooltips and aria-labels. */
export function formatFull(value: number | null | undefined): string {
  if (isMissing(value)) return '—';
  return decimal(Math.round(value), 0);
}

export function formatInt(value: number | null | undefined): string {
  if (isMissing(value)) return '—';
  return decimal(Math.round(value), 0);
}

/** Per-hour rates of rare events (Raros/h): always one decimal, "2,5". */
export function formatRate(value: number | null | undefined): string {
  if (isMissing(value)) return '—';
  return decimal(value, 1, 1);
}

/** Time spent, as hours and minutes ("18h24", "212h30", "45min") - decimal
 * hours read wrong to players (0,4h is 24 minutes, not 40). */
export function formatHours(seconds: number | null | undefined): string {
  if (isMissing(seconds)) return '—';
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  return `${decimal(h, 0)}h${String(m).padStart(2, '0')}`;
}

/** A single hunt/MD/terror duration on cards and lists - same style as formatHours. */
export function formatDuration(seconds: number): string {
  return formatHours(seconds);
}

/** Exact clock-style duration ("01:00:48"), kept for detail pages and the
 * import confirmation, where it should match the game's own export. */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function formatDateTime(value: string): string {
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDate(value: string): string {
  const iso = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
}

/** Formats a trend bucket's start date for display, according to its granularity:
 * a single day as "dd/mm", a week as its "dd/mm–dd/mm" range, a month as "mmm/aaaa". */
export function formatBucketLabel(bucketStart: string, bucket: 'day' | 'week' | 'month' | 'hunt' | 'terror' | 'md'): string {
  if (bucket === 'hunt' || bucket === 'terror' || bucket === 'md') {
    return formatDateTime(bucketStart);
  }
  if (bucket === 'month') {
    const [year, month] = bucketStart.split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  if (bucket === 'week') {
    const start = new Date(`${bucketStart}T00:00:00`);
    if (Number.isNaN(start.getTime())) return bucketStart;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${shortDate(start)}–${shortDate(end)}`;
  }
  return formatDate(bucketStart);
}

export function formatPercent(value: number | null | undefined): string {
  if (isMissing(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${decimal(value, 1, 1)}%`;
}
