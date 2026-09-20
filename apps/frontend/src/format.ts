export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('pt-BR');
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function formatDateTime(value: string): string {
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDate(value: string): string {
  const iso = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Formats a trend bucket's start date for display, according to its granularity:
 * a single day as "dd/mm", a week as its "dd/mm–dd/mm" range, a month as "mmm/aaaa". */
export function formatBucketLabel(bucketStart: string, bucket: 'day' | 'week' | 'month' | 'hunt'): string {
  if (bucket === 'hunt') {
    return formatDateTime(bucketStart);
  }
  if (bucket === 'month') {
    const [year, month] = bucketStart.split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
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
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}
