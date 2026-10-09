import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { HuntListItem, MdListItem, TerrorListItem } from '../../api/types';
import { useFilters } from '../../FiltersContext';
import { useSkin } from '../../theme/ThemeContext';
import { HuntCard } from '../HuntCard';
import { MdCard } from '../MdCard';
import { countByBoss } from '../mdDefeats';
import { TerrorCard } from '../TerrorCard';

type Kind = 'hunt' | 'md' | 'terror';

// A page of cards is plenty for a dashboard: the Histórico tab lists them all.
const PAGE_SIZE = 12;
// Zoomed down to individual entries (a day, a short selection) the list IS the
// answer to "what happened then", so it gets more room.
const ENTRY_PAGE_SIZE = 24;

const TITLES: Record<Kind, string> = {
  hunt: 'Hunts do período',
  md: 'MDs do período',
  terror: 'Rotações do período',
};

const ENTRY_TITLES: Record<Kind, string> = {
  hunt: 'Hunts',
  md: 'MDs',
  terror: 'Rotações',
};

type Row = { kind: 'hunt'; item: HuntListItem } | { kind: 'md'; item: MdListItem } | { kind: 'terror'; item: TerrorListItem };

interface PeriodCardsProps {
  kind: Kind;
  /** The chart is zoomed to one point per hunt/MD/terror: list that period's
   * entries as cards in EVERY skin (up to 24, newest first). Otherwise only the
   * Cartas skin shows the period as a spread of cards under the chart. */
  entryLevel?: boolean;
  /** Names the zoomed period in the title ("Hunts · Dia · 07/10/2026"). */
  periodLabel?: string;
}

// The Cartas skin shows the period as a spread of cards right under the chart
// (the card grid is otherwise only in the Histórico tab), most recent first.
// The other skins keep the dashboard as it was - until the chart is zoomed
// down to single entries, where the cards are the natural next level.
export function PeriodCards({ kind, entryLevel = false, periodLabel }: PeriodCardsProps) {
  const { skin } = useSkin();
  const visible = skin === 'cards' || entryLevel;
  const pageSize = entryLevel ? ENTRY_PAGE_SIZE : PAGE_SIZE;
  const { player, sessionType, from, to } = useFilters();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // Times each boss was defeated in the whole period (unique MD records), not
  // just among the cards on screen.
  const [defeats, setDefeats] = useState<Map<string, number>>(new Map());
  // What the rows on screen were fetched for: the title and the range move on
  // right away, the rows arrive a moment later.
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = `${kind}|${player}|${sessionType}|${from}|${to}|${pageSize}`;

  useEffect(() => {
    if (!visible) return;
    let ignore = false;
    setLoading(true);
    const filters = { player, sessionType, from, to, sort: 'start_time', order: 'desc', page: 1, pageSize };
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
        setLoadedKey(requestKey);
      })
      .catch(() => {
        // A failed fetch must not leave the previous period's cards under the new title.
        if (ignore) return;
        setRows([]);
        setTotal(0);
        setLoadedKey(requestKey);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [visible, pageSize, kind, player, sessionType, from, to, requestKey]);

  useEffect(() => {
    if (!visible || kind !== 'md') return;
    let ignore = false;
    api
      .getMds({ player, sessionType, from, to, page: 1, pageSize: 200 })
      .then((r) => {
        if (!ignore) setDefeats(countByBoss(r.items));
      })
      .catch(() => {
        if (!ignore) setDefeats(new Map());
      });
    return () => {
      ignore = true;
    };
  }, [visible, kind, player, sessionType, from, to]);

  if (!visible) return null;

  // Per-entry lists name their period: never show another period's cards under
  // that name. The dashboard spread (Cartas) keeps its cards, faded, meanwhile.
  const stale = loadedKey !== requestKey;
  const title = entryLevel ? `${ENTRY_TITLES[kind]}${periodLabel ? ` · ${periodLabel}` : ''}` : TITLES[kind];
  return (
    <section className="section period-cards" aria-label={title} aria-busy={stale} style={stale && !entryLevel ? { opacity: 0.6 } : undefined}>
      <h2 className="section-title">
        {title}
        {!stale && !loading && <span className="num"> ({total})</span>}
      </h2>
      {(loading && rows.length === 0) || (stale && entryLevel) ? (
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
                <MdCard key={`m${row.item.id}`} md={row.item} defeats={defeats.get(row.item.md_name ?? '')} />
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
