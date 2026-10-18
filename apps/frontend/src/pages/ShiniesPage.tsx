import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { parseHuntJson } from '../jsonParse';
import { StatTile } from '../components/StatTile';
import { ConfirmShinyModal } from '../components/ConfirmShinyModal';
import { PokemonSprite } from '../components/PokemonSprite';
import { TierBadge } from '../components/TierBadge';
import { ChartFrame } from '../components/charts/chartKit';
import { baseName } from '../components/rares/RareSprite';
import { PeriodRange } from '../components/PeriodRange';
import { TypeFilter } from '../components/TypeFilter';
import { FilterMenu, type FilterSummaryItem } from '../components/FilterMenu';
import { POKEMON_TYPES, typeLabel, variantBadges, type PokemonType } from '../pokemon';
import { SHINY_TIERS, tierLabel } from '../shinyTiers';
import type {
  ShinyHuntFind,
  ShinyHuntRow,
  ShinyPokemonRow,
  ShinyStats,
  ShinyTierFilter,
  ShinyTierRow,
} from '../api/types';
import { formatDateTime, formatHours, formatInt, formatRate } from '../format';

const RECENT_HUNTS = 10;

type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'duplicate'; huntId: number }
  | { kind: 'success'; huntId: number; players: string[]; huntName: string | null };

const TIER_CHIPS: ShinyTierFilter[] = [...SHINY_TIERS, 'out'];

/** The tier filter lives in the URL (?tier=1C,1H) so it survives a reload and
 * can be shared; unknown tokens are dropped and the order is the catalog's. */
function useTierFilter(): [ShinyTierFilter[], (next: ShinyTierFilter[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tier') ?? '';
  const tiers = useMemo(() => {
    const wanted = new Set(raw.split(',').map((t) => t.trim().toUpperCase()));
    return TIER_CHIPS.filter((t) => wanted.has(t.toUpperCase()));
  }, [raw]);
  const setTiers = (next: ShinyTierFilter[]) =>
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        if (next.length === 0) updated.delete('tier');
        else updated.set('tier', next.join(','));
        return updated;
      },
      { replace: true }
    );
  return [tiers, setTiers];
}

/** The element filter lives in the URL too (?tipo=fire,water): unknown values
 * are ignored and the order is the canonical type order, so equal selections
 * share one URL. */
function useTypeFilter(): [PokemonType[], (next: PokemonType[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tipo') ?? '';
  const types = useMemo(() => {
    const wanted = new Set(raw.split(',').map((t) => t.trim().toLowerCase()));
    return POKEMON_TYPES.filter((t) => wanted.has(t));
  }, [raw]);
  const setTypes = (next: PokemonType[]) =>
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        if (next.length === 0) updated.delete('tipo');
        else updated.set('tipo', next.join(','));
        return updated;
      },
      { replace: true }
    );
  return [types, setTypes];
}

type TierMetric = 'killsPerShiny' | 'shinies' | 'kills' | 'hunts';

const TIER_METRICS: { key: TierMetric; label: string; hint: string }[] = [
  {
    key: 'killsPerShiny',
    label: 'Kills por shiny',
    hint: 'Média de kills para cada shiny: barra maior = mais kills por shiny (menos sorte), não o tier mais caçado.',
  },
  { key: 'shinies', label: 'Shinies', hint: 'Total de shinies encontrados em cada tier: barra maior = mais shinies.' },
  {
    key: 'kills',
    label: 'Kills',
    hint: 'Total de kills das espécies de cada tier (uma vez por hunt): barra maior = mais caçado.',
  },
  { key: 'hunts', label: 'Hunts', hint: 'Quantidade de hunts em que o tier apareceu: barra maior = tier mais caçado.' },
];

type SortKey = 'name' | 'tier' | 'hunts' | 'shinies' | 'kills' | 'killsPerShiny' | 'shiniesPerHour';
interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export function ShiniesTab() {
  const { player, sessionType, from, to, setDateRange } = useFilters();
  const [tiers, setTiers] = useTierFilter();
  // Kept here (not in the sections) so they survive a refetch or an empty result.
  const [tierMetric, setTierMetric] = useState<TierMetric>('killsPerShiny');
  const [sort, setSort] = useState<SortState>({ key: 'shinies', dir: 'desc' });
  const [types, setTypes] = useTypeFilter();
  const [, setSearchParams] = useSearchParams();
  const tiersKey = tiers.join(',');
  const typesKey = types.join(',');
  const [stats, setStats] = useState<ShinyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped after an import so the stats are fetched again for the same filters.
  const [reloadKey, setReloadKey] = useState(0);

  // The period is the global from/to (PeriodRange, the header filter). A first
  // visit has none, i.e. "Tudo": a shiny drops every few hundred kills, so a
  // single week is often too little to read. There is no chart to zoom here,
  // hence no chart scope: the stats are fetched on any change of the range.
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    api
      .getShinyStats({ player, sessionType, from, to, tiers, types })
      .then((res) => {
        if (!ignore) setStats(res);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Erro ao carregar os shinies.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
    // tiersKey / typesKey stand for the arrays (new on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, sessionType, from, to, tiersKey, typesKey, reloadKey]);

  const hasRange = Boolean(from || to);
  const filtering = tiers.length > 0 || types.length > 0;
  // One URL update: two successive setSearchParams calls both start from the
  // same params, so the second would undo the first.
  const clearFilters = () =>
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        updated.delete('tier');
        updated.delete('tipo');
        return updated;
      },
      { replace: true }
    );

  return (
    <div>
      <p className="page-subtitle">
        Médias de kills por shiny, por Pokémon e por tier da roleta, a partir das hunts shiny importadas aqui e do histórico da antiga roleta.
      </p>

      <ShinyImport onImported={() => setReloadKey((k) => k + 1)} />
      <PeriodRange>
        <ShinyFilterBar
          tiers={tiers}
          onTiers={setTiers}
          types={types}
          onTypes={setTypes}
          onClear={clearFilters}
          unknownTypePokemon={stats?.unknownTypePokemon ?? 0}
        />
      </PeriodRange>

      {error && <div className="error-box">{error}</div>}

      {!stats ? (
        !error && <div className="empty-state">Carregando...</div>
      ) : (
        // A refetch keeps the previous numbers on screen, faded, instead of
        // flashing a loading placeholder and making the page jump.
        <div className={loading ? 'shinies-body shinies-refetching' : 'shinies-body'} aria-busy={loading}>
          <ShinyKpis stats={stats} />

          {stats.hunts === 0 ? (
            <div className="card empty-state">
              <p style={{ margin: '0 0 12px' }}>
                {filtering
                  ? 'Nenhuma hunt shiny com esses filtros neste período.'
                  : 'Nenhuma hunt shiny no período. Importe o JSON de uma hunt acima para entrar nas médias.'}
              </p>
              {filtering && (
                <button
                  className="secondary"
                  style={{ marginRight: 8 }}
                  onClick={clearFilters}
                >
                  Limpar filtros
                </button>
              )}
              {hasRange && (
                <button className="secondary" onClick={() => setDateRange({ from: '', to: '' })}>
                  Ver todo o período
                </button>
              )}
            </div>
          ) : (
            <>
              <section className="section">
                <h2 className="section-title">Por tier</h2>
                <div className="card">
                  <TierBars tiers={stats.tiers} metric={tierMetric} onMetric={setTierMetric} elementFilter={types.length > 0} />
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">
                  Por Pokémon <span className="num">({formatInt(stats.pokemon.length)})</span>
                </h2>
                <div className="card">
                  <PokemonTable pokemon={stats.pokemon} sort={sort} onSort={setSort} />
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">
                  Hunts shiny <span className="num">({formatInt(stats.huntList.length)})</span>
                </h2>
                <HuntList hunts={stats.huntList} />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ShinyKpis({ stats }: { stats: ShinyStats }) {
  const none = stats.hunts === 0;
  return (
    <div className="stat-grid">
      <StatTile label="Hunts shiny" value={formatInt(stats.hunts)} sub={none ? 'Nenhuma no período' : `${formatInt(stats.sessionKills)} kills nas sessões`} />
      <StatTile label="Shinies" value={formatInt(stats.shinies)} sub={none ? undefined : 'alvos e extras da mesma hunt'} />
      <StatTile
        label="Kills por shiny"
        value={formatInt(stats.killsPerShiny)}
        sub={stats.killsPerShiny === null && !none ? 'Nenhum alvo dropou ainda' : 'só dos alvos'}
      />
      <StatTile
        label="Shinies/h"
        value={formatRate(stats.shiniesPerHour)}
        sub={stats.shiniesPerHour === null && !none ? 'Sem tempo de hunt' : 'só dos alvos'}
      />
      <StatTile label="Tempo total" value={formatHours(stats.durationSeconds)} />
    </div>
  );
}

function ShinyFilterBar({
  tiers,
  onTiers: onChange,
  types,
  onTypes,
  onClear,
  unknownTypePokemon,
}: {
  tiers: ShinyTierFilter[];
  onTiers: (next: ShinyTierFilter[]) => void;
  types: PokemonType[];
  onTypes: (next: PokemonType[]) => void;
  onClear: () => void;
  unknownTypePokemon: number;
}) {
  const toggle = (tier: ShinyTierFilter) =>
    onChange(tiers.includes(tier) ? tiers.filter((t) => t !== tier) : TIER_CHIPS.filter((t) => t === tier || tiers.includes(t)));
  const chip = (key: string, pressed: boolean, label: ReactNode, onClick: () => void) => (
    <button key={key} type="button" className={pressed ? '' : 'secondary'} aria-pressed={pressed} onClick={onClick}>
      {label}
    </button>
  );
  // What each closed filter button says is active (the URL's order, kept canonical).
  const tierItems: FilterSummaryItem[] = tiers.map((t) =>
    t === 'out' ? { label: 'Fora da roleta' } : { label: t, num: true }
  );
  const typeItems: FilterSummaryItem[] = types.map((t) => ({ label: typeLabel(t) }));
  return (
    <FilterMenu
      id="shinies-filters"
      onClear={onClear}
      tier={{
        items: tierItems,
        panel: (
          <div className="chart-toolbar rares-filters">
            <div className="chart-toolbar-group">
              <span className="chart-toolbar-label" id="shinies-tier-filter-label">
                Tier
              </span>
              <div className="bucket-toggle shinies-chips" role="group" aria-labelledby="shinies-tier-filter-label">
                {chip('all', tiers.length === 0, 'Todos', () => onChange([]))}
                {TIER_CHIPS.map((t) =>
                  chip(t, tiers.includes(t), t === 'out' ? 'Fora da roleta' : <span className="num">{t}</span>, () => toggle(t))
                )}
              </div>
            </div>
            {tiers.length > 0 && (
              <p className="shinies-note" style={{ margin: 0 }}>
                Só hunts com Pokémon de {tiers.map((t) => tierLabel(t === 'out' ? null : t)).join(', ')} (também as que não
                tiveram o shiny dele): números, tabelas e gráfico contam apenas esses tiers.
              </p>
            )}
          </div>
        ),
      }}
      element={{
        items: typeItems,
        panel: (
          <div className="chart-toolbar rares-filters">
            <TypeFilter
              selected={new Set(types)}
              // Back to the canonical order, so equal selections share one URL.
              onChange={(next) => onTypes(POKEMON_TYPES.filter((t) => next.has(t)))}
            />
            {types.length > 0 && (
              <p className="shinies-note" style={{ margin: 0 }}>
                Só Pokémon do elemento {types.map((t) => typeLabel(t)).join(' ou ')}
                {tiers.length > 0 ? ' e dos tiers escolhidos' : ''}: números, tabelas e gráfico contam apenas esses Pokémon
                (um Pokémon de dois elementos aparece em qualquer um deles). Hunts com um Pokémon desse elemento entram
                mesmo quando ele não deu shiny.
                {unknownTypePokemon > 0 && (
                  <>
                    {' '}
                    <span className="num">{formatInt(unknownTypePokemon)}</span>{' '}
                    {unknownTypePokemon === 1 ? 'Pokémon ficou de fora' : 'Pokémon ficaram de fora'} por não ter elemento
                    conhecido.
                  </>
                )}
              </p>
            )}
          </div>
        ),
      }}
    />
  );
}

// Bar length follows the chosen metric. By default it is kills por shiny, where
// a longer bar means MORE kills per drop (worse luck), not the most-hunted
// tier, so the hint says so and each row shows the volume it rests on. The
// numbers sit beside each bar and in "Ver tabela", so nothing depends on color.
function TierBars({
  tiers,
  metric,
  onMetric,
  elementFilter,
}: {
  tiers: ShinyTierRow[];
  metric: TierMetric;
  onMetric: (m: TierMetric) => void;
  elementFilter: boolean;
}) {
  const current = TIER_METRICS.find((m) => m.key === metric)!;
  const valueOf = (t: ShinyTierRow): number | null => t[metric];
  const max = Math.max(0, ...tiers.map((t) => valueOf(t) ?? 0));
  const volume = (t: ShinyTierRow) =>
    `${formatInt(t.hunts)} ${t.hunts === 1 ? 'hunt' : 'hunts'} · ${formatInt(t.kills)} kills · ${formatInt(t.shinies)} ${
      t.shinies === 1 ? 'shiny' : 'shinies'
    }`;
  const table = {
    columns: ['Tier', 'Pokémon', 'Hunts', 'Kills', 'Shinies', 'Kills por shiny'],
    numericColumns: [1, 2, 3, 4, 5],
    rows: tiers.map((t) => ({
      key: t.tier ?? 'out',
      cells: [
        tierLabel(t.tier),
        formatInt(t.pokemon),
        formatInt(t.hunts),
        formatInt(t.kills),
        formatInt(t.shinies),
        formatInt(t.killsPerShiny),
      ],
    })),
  };
  if (tiers.length === 0) return <div className="empty-state">Nenhum shiny no período.</div>;
  return (
    <>
      <div className="chart-toolbar-group" style={{ marginBottom: 6 }}>
        <span className="chart-toolbar-label" id="shinies-tier-metric-label">
          Barra mostra
        </span>
        <div className="bucket-toggle shinies-chips" role="group" aria-labelledby="shinies-tier-metric-label">
          {TIER_METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={metric === m.key ? '' : 'secondary'}
              aria-pressed={metric === m.key}
              onClick={() => onMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="shinies-note" style={{ marginBottom: 8 }}>
        {current.hint}{' '}
        {elementFilter
          ? 'Com o filtro de elemento, as barras contam só os Pokémon do elemento escolhido, não os outros da mesma hunt;'
          : 'Nas barras, kills e shinies incluem os extras da mesma hunt;'}{' '}
        o card "Kills por shiny" do topo conta só os alvos.
      </p>
      <ChartFrame caption={`${current.label}, por tier`} table={table}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {tiers.map((t) => {
            const value = valueOf(t);
            return (
              <li
                key={t.tier ?? 'out'}
                className="shinies-tier-row"
                aria-label={`${tierLabel(t.tier)}: ${
                  value === null ? 'sem shinies' : `${formatInt(value)} ${current.label.toLowerCase()}`
                }; ${volume(t)}`}
              >
                <span className="shinies-tier-label">
                  <TierBadge tier={t.tier} />
                  <span className="shinies-sub">{volume(t)}</span>
                </span>
                <span className="shinies-tier-track" aria-hidden="true">
                  {value !== null && max > 0 && (
                    <span
                      className={`shinies-tier-fill tier-${t.tier ? t.tier.toLowerCase() : 'out'}`}
                      style={{ display: 'block', width: `${(value / max) * 100}%` }}
                    />
                  )}
                </span>
                <span className="shinies-tier-value">
                  {value === null ? '—' : <span className="num">{formatInt(value)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </ChartFrame>
    </>
  );
}

function NameCell({ name }: Pick<ShinyPokemonRow, 'name'>) {
  const badges = variantBadges(name);
  return (
    <div className="shinies-name-cell">
      <PokemonSprite name={name} alt="" width={40} />
      <span>
        {baseName(name)}{' '}
        {badges.length > 0 && (
          <span className="rare-badges">
            {badges.map((badge) => (
              <span key={badge} className="badge rare-badge">
                {badge}
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

const SORT_COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Pokémon', numeric: false },
  { key: 'tier', label: 'Tier', numeric: false },
  { key: 'hunts', label: 'Hunts', numeric: true },
  { key: 'shinies', label: 'Shinies', numeric: true },
  { key: 'kills', label: 'Kills', numeric: true },
  { key: 'killsPerShiny', label: 'Kills por shiny', numeric: true },
  { key: 'shiniesPerHour', label: 'Shinies/h (como alvo)', numeric: true },
];

/** Sort value of a row; null (no tier, no ratio) always lands last. */
function sortValue(p: ShinyPokemonRow, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return baseName(p.name);
    case 'tier':
      return p.tier ? SHINY_TIERS.indexOf(p.tier) : null;
    default:
      return p[key];
  }
}

function sortPokemon(pokemon: ShinyPokemonRow[], { key, dir }: SortState): ShinyPokemonRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  // By the name the cell shows, then the full name so Shiny X and Mega X of one species stay adjacent.
  const byName = (a: ShinyPokemonRow, b: ShinyPokemonRow) =>
    baseName(a.name).localeCompare(baseName(b.name), 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR');
  return [...pokemon].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    // Direction never moves the nulls: they stay at the bottom either way.
    if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number);
    return cmp * sign || byName(a, b);
  });
}

function PokemonTable({
  pokemon,
  sort,
  onSort,
}: {
  pokemon: ShinyPokemonRow[];
  sort: SortState;
  onSort: (next: SortState) => void;
}) {
  if (pokemon.length === 0) return <div className="empty-state">Nenhum shiny no período.</div>;
  const rows = sortPokemon(pokemon, sort);
  const click = (col: (typeof SORT_COLUMNS)[number]) =>
    onSort(
      sort.key === col.key
        ? { key: col.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : // First click: names and tiers read best A to Z / 1A first, numbers biggest first.
          { key: col.key, dir: col.numeric ? 'desc' : 'asc' }
    );
  return (
    <div className="shinies-table-wrap">
      <table className="data-table shinies-table">
        <caption className="visually-hidden">Shinies por Pokémon (clique no título de uma coluna para ordenar)</caption>
        <thead>
          <tr>
            {SORT_COLUMNS.map((col) => {
              const active = sort.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={col.numeric ? 'num' : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className="shinies-sort" onClick={() => click(col)}>
                    {col.label}
                    {/* The arrow is a glyph, so the order is not told by colour alone. */}
                    <span className="shinies-sort-arrow" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name}>
              <td>
                <NameCell name={p.name} />
              </td>
              <td>
                <TierBadge tier={p.tier} removed={p.removed} />
              </td>
              <td className="num">{formatInt(p.hunts)}</td>
              <td className="num">{formatInt(p.shinies)}</td>
              <td className="num">{formatInt(p.kills)}</td>
              <td className="num">{formatInt(p.killsPerShiny)}</td>
              <td className="num">
                {formatRate(p.shiniesPerHour)}
                <span className="shinies-sub">
                  {p.targetHunts > 0
                    ? `${formatInt(p.targetShinies)} em ${formatHours(p.targetDurationSeconds)} · ${formatInt(p.targetHunts)} ${
                        p.targetHunts === 1 ? 'hunt alvo' : 'hunts alvo'
                      }`
                    : 'nunca foi alvo'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function findRole(find: ShinyHuntFind): string {
  const role = find.isTarget ? 'Alvo' : find.isTargetCompanion ? 'Companion do alvo' : 'Na mesma hunt';
  // Said in text (and muted), so the filter's effect is not told by colour alone.
  return find.outsideFilter ? `${role} · fora do filtro` : role;
}

function HuntList({ hunts }: { hunts: ShinyHuntRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? hunts : hunts.slice(0, RECENT_HUNTS);
  return (
    <>
      <ul className="shinies-hunt-list">
        {visible.map((hunt) => (
          <li key={`${hunt.legacy ? 'l' : 'h'}-${hunt.id}`} className="card shinies-hunt-item">
            <div className="shinies-hunt-head">
              {hunt.legacy ? (
                // Old roulette history has no hunt page to open.
                <span className="badge shinies-legacy-badge">Histórico da roleta</span>
              ) : (
                <Link to={`/hunts/${hunt.id}`}>{hunt.huntName ?? 'Hunt'}</Link>
              )}
              <span>{formatDateTime(hunt.startTime)}</span>
              <span>{hunt.durationSeconds > 0 ? formatHours(hunt.durationSeconds) : 'Sem tempo'}</span>
              <span>{formatInt(hunt.sessionKills)} kills</span>
              {hunt.players.length > 0 && <span className="shinies-find-role">{hunt.players.join(', ')}</span>}
            </div>
            {hunt.finds.length === 0 ? (
              <p className="shinies-find-role" style={{ margin: 0 }}>
                {hunt.targetName ?? 'Alvo'}: nenhum shiny nessa sessão.
              </p>
            ) : (
              <ul className="shinies-find-list">
                {hunt.finds.map((find) => (
                  <li key={find.name} className={find.outsideFilter ? 'shinies-find shinies-find-outside' : 'shinies-find'}>
                    <PokemonSprite name={find.name} alt="" width={28} />
                    <span>
                      {find.name} <span className="num">× {formatInt(find.count)}</span>
                    </span>
                    <TierBadge tier={find.tier} />
                    <span className="shinies-find-role">{findRole(find)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {hunts.length > RECENT_HUNTS && (
        <div style={{ marginTop: 10 }}>
          <button className="secondary" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? (
              'Mostrar só as mais recentes'
            ) : (
              <>
                Mostrar todas <span className="num">({formatInt(hunts.length)})</span>
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}

// Same paste / drop flow as Hunts > Importar hunt, but the confirmation also
// asks which Pokémon the session was hunting.
function ShinyImport({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<ImportStatus>({ kind: 'idle' });
  const [pendingHunt, setPendingHunt] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const { refreshPlayers } = useFilters();

  function parseAndPreview(raw: string) {
    setStatus({ kind: 'idle' });
    const parsed = parseHuntJson(raw);
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.message! });
      return;
    }
    setModalError(null);
    setPendingHunt(parsed.data);
  }

  async function confirmUpload(huntName: string, shinyTarget: string) {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await api.uploadHunt({ hunt: pendingHunt, huntName, shinyTarget });
      if (res.status === 409) {
        // Already imported (maybe from Hunts, without a target): only the
        // target is saved, the hunt's own data is left alone.
        await api.setShinyTarget(res.body.existingHuntId, shinyTarget);
        setPendingHunt(null);
        setStatus({ kind: 'duplicate', huntId: res.body.existingHuntId });
        setText('');
        onImported();
      } else if (!res.ok) {
        const issues = res.body.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n');
        setModalError(issues || res.body.error || 'Falha ao importar a hunt.');
      } else {
        setPendingHunt(null);
        setStatus({ kind: 'success', huntId: res.body.id, players: res.body.players, huntName: res.body.huntName });
        setText('');
        refreshPlayers();
        onImported();
      }
    } catch (err) {
      setModalError(`Falha ao importar a hunt: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    file.text().then((content) => {
      setText(content);
      parseAndPreview(content);
    });
  }

  return (
    <section className="section shinies-import">
      <h2 className="section-title">Importar hunt shiny</h2>
      <p className="shinies-note">
        Cole o mesmo JSON do analyzer usado em Hunts ou arraste o arquivo .json. Você confirma o alvo antes de
        importar.
      </p>

      {status.kind === 'error' && <div className="error-box">{status.message}</div>}
      {status.kind === 'duplicate' && (
        <div className="success-box">
          Essa hunt já tinha sido importada: o alvo dela foi atualizado.{' '}
          <Link to={`/hunts/${status.huntId}`}>Ver hunt existente</Link>
        </div>
      )}
      {status.kind === 'success' && (
        <div className="success-box">
          Hunt {status.huntName ? `de ${status.huntName} ` : ''}importada com sucesso ({status.players.join(', ')}).{' '}
          <Link to={`/hunts/${status.huntId}`}>Ver detalhes</Link>
        </div>
      )}

      <div
        className={`upload-drop ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        Arraste o arquivo .json da hunt aqui
      </div>

      <textarea
        rows={6}
        aria-label="JSON exportado da hunt"
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }}
        placeholder="Cole aqui o JSON exportado da hunt..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button disabled={!text.trim()} onClick={() => parseAndPreview(text)}>
          Importar hunt shiny
        </button>
      </div>

      {pendingHunt && (
        <ConfirmShinyModal
          hunt={pendingHunt}
          submitting={submitting}
          errorMessage={modalError}
          onConfirm={confirmUpload}
          onCancel={() => {
            setPendingHunt(null);
            setModalError(null);
          }}
        />
      )}
    </section>
  );
}
