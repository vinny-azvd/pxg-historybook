import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import type { HuntListItem } from '../api/types';
import { HuntCard } from '../components/HuntCard';
import { CardSettingsPanel } from '../components/CardSettingsPanel';

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'start_time', label: 'Data' },
  { key: 'hunt_name', label: 'Hunt' },
  { key: 'duration_seconds', label: 'Duração' },
  { key: 'profit', label: 'Profit' },
  { key: 'profit_per_hour', label: 'Profit/h' },
  { key: 'kills_per_hour', label: 'Kills/h' },
  { key: 'rare_kills_per_hour', label: 'Raros/h' },
];

export function HuntsHistoryPage() {
  const { player, sessionType, from, to } = useFilters();
  const [items, setItems] = useState<HuntListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('start_time');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  useEffect(() => {
    setLoading(true);
    api
      .getHunts({ player, sessionType, from, to, sort, order, page, pageSize })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [player, sessionType, from, to, sort, order, page]);

  useEffect(() => setPage(1), [player, sessionType, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="page-title">Histórico de hunts</h1>
          <p className="page-subtitle">
            {total} hunt{total === 1 ? '' : 's'} registrada{total === 1 ? '' : 's'}. Clique num card para ver os
            raros e drops raros dessa hunt.
          </p>
        </div>
        <CardSettingsPanel />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label htmlFor="sort-select" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Ordenar por
        </label>
        <select id="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}>
          {order === 'asc' ? '▲ Asc' : '▼ Desc'}
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          Nenhuma hunt encontrada. <Link to="/upload">Importe sua primeira hunt</Link>.
        </div>
      ) : (
        <div className="hunt-card-grid">
          {items.map((hunt) => (
            <HuntCard key={hunt.id} hunt={hunt} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Página {page} de {totalPages}
          </span>
          <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
