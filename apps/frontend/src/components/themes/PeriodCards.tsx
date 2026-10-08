import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { HuntListItem, MdListItem, TerrorListItem } from '../../api/types';
import { useFilters } from '../../FiltersContext';
import { useSkin } from '../../theme/ThemeContext';
import { HuntCard } from '../HuntCard';
import { MdCard } from '../MdCard';
import { TerrorCard } from '../TerrorCard';

type Kind = 'hunt' | 'md' | 'terror';

// A page of cards is plenty for a dashboard: the Histórico tab lists them all.
const PAGE_SIZE = 12;

const TITLES: Record<Kind, string> = {
  hunt: 'Hunts do período',
  md: 'MDs do período',
  terror: 'Rotações do período',
};

type Row = { kind: 'hunt'; item: HuntListItem } | { kind: 'md'; item: MdListItem } | { kind: 'terror'; item: TerrorListItem };

// The Cartas skin shows the period as a spread of cards right under the chart
// (the card grid is otherwise only in the Histórico tab), most recent first.
// Other skins keep the dashboard as it was, so this renders nothing there.
export function PeriodCards({ kind }: { kind: Kind }) {
  const { skin } = useSkin();
  const { player, sessionType, from, to } = useFilters();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (skin !== 'cards') return;
    let ignore = false;
    setLoading(true);
    const filters = { player, sessionType, from, to, sort: 'start_time', order: 'desc', page: 1, pageSize: PAGE_SIZE };
    const request =
      kind === 'hunt'
        ? api.getHunts(filters).then((r) => ({ total: r.total, rows: r.items.map((item): Row => ({ kind: 'hunt', item })) }))
        : kind === 'md'
          ? api.getMds(filters).then((r) => ({ total: r.total, rows: r.items.map((item): Row => ({ kind: 'md', item })) }))
          : api.getTerrors(filters).then((r) => ({ total: r.total, rows: r.items.map((item): Row => ({ kind: 'terror', item })) }));
    request
      .then((res) => {
        if (ignore) return;
        setRows(res.rows);
        setTotal(res.total);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [skin, kind, player, sessionType, from, to]);

  if (skin !== 'cards') return null;

  return (
    <section className="section period-cards" aria-label={TITLES[kind]}>
      <h2 className="section-title">
        {TITLES[kind]}
        {!loading && ` (${total})`}
      </h2>
      {loading && rows.length === 0 ? (
        <div className="empty-state">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">Nenhum registro no período selecionado.</div>
      ) : (
        <>
          <div className="hunt-card-grid">
            {rows.map((row) =>
              row.kind === 'hunt' ? (
                <HuntCard key={`h${row.item.id}`} hunt={row.item} />
              ) : row.kind === 'md' ? (
                <MdCard key={`m${row.item.id}`} md={row.item} />
              ) : (
                <TerrorCard key={`t${row.item.id}`} terror={row.item} />
              ),
            )}
          </div>
          {total > rows.length && (
            <p className="period-cards-note">
              Mostrando os {rows.length} mais recentes de {total}. A aba Histórico lista todos.
            </p>
          )}
        </>
      )}
    </section>
  );
}
