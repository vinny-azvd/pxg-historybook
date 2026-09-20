import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import type { HuntListItem } from '../api/types';
import { formatCompact, formatDateTime, formatDuration, formatInt } from '../format';

const COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: 'hunt_name', label: 'Hunt', sortable: true },
  { key: 'start_time', label: 'Data', sortable: true },
  { key: 'duration_seconds', label: 'Duração', sortable: true },
  { key: 'players', label: 'Personagem(s)' },
  { key: 'profit', label: 'Profit', sortable: true },
  { key: 'profit_per_hour', label: 'Profit/h', sortable: true },
  { key: 'kills_per_hour', label: 'Kills/h', sortable: true },
  { key: 'rare_kills_per_hour', label: 'Raros/h', sortable: true },
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

  function toggleSort(key: string) {
    if (sort === key) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key);
      setOrder('desc');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="page-title">Histórico de hunts</h1>
      <p className="page-subtitle">
        {total} hunt{total === 1 ? '' : 's'} registrada{total === 1 ? '' : 's'}. Ordene por Profit/h para ver a hunt
        mais lucrativa.
      </p>

      <div className="card">
        {loading ? (
          <div className="empty-state">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            Nenhuma hunt encontrada. <Link to="/upload">Importe sua primeira hunt</Link>.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} onClick={() => col.sortable && toggleSort(col.key)}>
                    {col.label}
                    {col.sortable && sort === col.key ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((hunt) => (
                <tr key={hunt.id}>
                  <td>
                    <Link to={`/hunts/${hunt.id}`}>{hunt.hunt_name ?? 'Hunt'}</Link>
                  </td>
                  <td>{formatDateTime(hunt.start_time)}</td>
                  <td>{formatDuration(hunt.duration_seconds)}</td>
                  <td>
                    {hunt.players.join(', ')}
                    {hunt.session_type === 'party' && (
                      <>
                        {' '}
                        <span className="badge">party</span>
                      </>
                    )}
                  </td>
                  <td>{formatCompact(hunt.profit)}</td>
                  <td>{formatCompact(hunt.profit_per_hour)}</td>
                  <td>{formatInt(hunt.kills_per_hour)}</td>
                  <td>{formatInt(hunt.rare_kills_per_hour)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
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
