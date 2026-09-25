export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonthKey(): string {
  return monthKey(new Date());
}

export function previousMonthKey(): string {
  const now = new Date();
  return monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function monthRange(yearMonth: string): { from: string; to: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return { from: toISODate(from), to: toISODate(to) };
}

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Converts one trend bucket's start value into a { from, to } range for that
 * single bucket, so clicking a point on the chart can filter down to exactly
 * the day/week/month it represents. */
export function bucketRange(bucketStart: string, bucket: 'day' | 'week' | 'month'): { from: string; to: string } {
  if (bucket === 'month') {
    return monthRange(bucketStart.slice(0, 7));
  }
  if (bucket === 'week') {
    const start = new Date(`${bucketStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: toISODate(start), to: toISODate(end) };
  }
  return { from: bucketStart, to: bucketStart };
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

/** The { from, to } range of the day/week/month that contains `date`, e.g. to
 * jump the dashboard's period filter straight to "the week of March 3rd". */
export function periodRangeForDate(date: Date, bucket: 'day' | 'week' | 'month'): { from: string; to: string } {
  if (bucket === 'month') return monthRange(monthKey(date));
  if (bucket === 'week') {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: toISODate(start), to: toISODate(end) };
  }
  const iso = toISODate(date);
  return { from: iso, to: iso };
}

/** The bucketStart value the backend would report for the day/week/month
 * containing `date`, for reuse with formatBucketLabel. */
export function bucketStartForDate(date: Date, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'month') return `${monthKey(date)}-01`;
  if (bucket === 'week') return toISODate(startOfWeek(date));
  return toISODate(date);
}

/** One day/week/month before or after `date`, for stepping the period
 * navigator's prev/next buttons. Months land on the 1st, so a step from Jan
 * 31st doesn't roll over into March. */
export function shiftPeriodDate(date: Date, bucket: 'day' | 'week' | 'month', direction: 1 | -1): Date {
  if (bucket === 'month') return new Date(date.getFullYear(), date.getMonth() + direction, 1);
  const result = new Date(date);
  result.setDate(result.getDate() + direction * (bucket === 'week' ? 7 : 1));
  return result;
}

export function defaultPeriods() {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  return {
    periodA: { from: toISODate(lastWeekStart), to: toISODate(lastWeekEnd) },
    periodB: { from: toISODate(thisWeekStart), to: toISODate(now) },
  };
}
