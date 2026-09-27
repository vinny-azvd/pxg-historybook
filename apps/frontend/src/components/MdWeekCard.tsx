import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Filters, MdListItem, MdWeeklySummary } from '../api/types';
import { bucketRange } from '../dates';
import { formatBucketLabel, formatCompact } from '../format';
import { MdCard } from './MdCard';

interface MdWeekCardProps {
  summary: MdWeeklySummary;
  filters: Filters;
}

// Grouped by week for the same reason as Terror's history list. A week with
// just one MD shows its card directly; a week with more than one shows a
// summary with the totals, expandable into the individual runs.
export function MdWeekCard({ summary, filters }: MdWeekCardProps) {
  const { from, to } = bucketRange(summary.weekStart, 'week');
  const [items, setItems] = useState<MdListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const single = summary.mdCount === 1;

  useEffect(() => {
    if (!single && !expanded) return;
    setLoading(true);
    api
      .getMds({ ...filters, from, to, sort: 'start_time', order: 'asc', page: 1, pageSize: 100 })
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }, [single, expanded, filters.player, filters.sessionType, from, to]);

  if (single) {
    if (!items) return <div className="empty-state">Carregando...</div>;
    return items[0] ? <MdCard md={items[0]} /> : null;
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
            {summary.mdCount} MDs registradas
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
            items.map((md) => <MdCard key={md.id} md={md} />)
          )}
        </div>
      )}
    </div>
  );
}
