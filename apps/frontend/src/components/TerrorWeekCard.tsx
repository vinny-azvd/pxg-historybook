import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Filters, TerrorListItem, TerrorWeeklySummary } from '../api/types';
import { bucketRange } from '../dates';
import { formatBucketLabel, formatCompact } from '../format';
import { TerrorCard } from './TerrorCard';

interface TerrorWeekCardProps {
  summary: TerrorWeeklySummary;
  filters: Filters;
}

// Terror is a weekly boss rotation, so most weeks have exactly one import.
// A week with just one shows its card directly, same as before; a week with
// more than one (a rotation split across imports, or redone) shows a summary
// with the totals, expandable into the individual terrors.
export function TerrorWeekCard({ summary, filters }: TerrorWeekCardProps) {
  const { from, to } = bucketRange(summary.weekStart, 'week');
  const [items, setItems] = useState<TerrorListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const single = summary.terrorCount === 1;

  useEffect(() => {
    if (!single && !expanded) return;
    setLoading(true);
    api
      .getTerrors({ ...filters, from, to, sort: 'start_time', order: 'asc', page: 1, pageSize: 100 })
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }, [single, expanded, filters.player, filters.sessionType, from, to]);

  if (single) {
    if (!items) return <div className="empty-state">Carregando...</div>;
    return items[0] ? <TerrorCard terror={items[0]} /> : null;
  }

  return (
    <div className="card">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <strong>Semana de {formatBucketLabel(summary.weekStart, 'week')}</strong>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {summary.terrorCount} terrors registrados
          </div>
        </div>
        <button className="secondary" style={{ fontSize: 11.5, padding: '2px 8px' }}>
          {expanded ? 'Ocultar detalhe' : 'Ver detalhe'}
        </button>
      </div>

      <dl className="hunt-card-stats" style={{ marginTop: 10 }}>
        <div>
          <dt>Profit total</dt>
          <dd>{formatCompact(summary.totalProfit)}</dd>
        </div>
        <div>
          <dt>Profit médio</dt>
          <dd>{formatCompact(summary.avgProfit)}</dd>
        </div>
      </dl>

      {expanded && (
        <div className="hunt-card-grid" style={{ marginTop: 14 }}>
          {loading || !items ? (
            <div className="empty-state">Carregando...</div>
          ) : (
            items.map((terror) => <TerrorCard key={terror.id} terror={terror} />)
          )}
        </div>
      )}
    </div>
  );
}
