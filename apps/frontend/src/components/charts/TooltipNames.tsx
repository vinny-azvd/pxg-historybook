import type { NameCount } from '../../api/types';

// Past this many names the tooltip would start towering over the chart, so
// the rest collapse into a "+N" tail.
const MAX_NAMES = 6;

export const tooltipDetailStyle = { color: 'var(--text-muted)', fontSize: 11.5, lineHeight: '16px' } as const;

/** The entry names behind one day/week/month point ("Sudowoodo ×3 · Raichu"),
 * kept small and muted so they read as context under the value, not as the
 * headline. */
export function TooltipNames({ names, prefix }: { names: NameCount[] | undefined; prefix?: string }) {
  if (!names || names.length === 0) return null;
  const shown = names.slice(0, MAX_NAMES);
  const hidden = names.length - shown.length;
  return (
    <div style={{ ...tooltipDetailStyle, maxWidth: 280 }}>
      {prefix && <span style={{ color: 'var(--text-secondary)' }}>{prefix} </span>}
      {shown.map((n) => (n.count > 1 ? `${n.name} ×${n.count}` : n.name)).join(' · ')}
      {hidden > 0 && ` · +${hidden}`}
    </div>
  );
}
