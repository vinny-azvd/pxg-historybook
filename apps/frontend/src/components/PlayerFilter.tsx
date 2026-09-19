import { useFilters } from '../FiltersContext';

export function PlayerFilter() {
  const { player, setPlayer, players, sessionType, setSessionType } = useFilters();

  return (
    <div className="filter-bar">
      <select value={player} onChange={(e) => setPlayer(e.target.value)} aria-label="Filtrar por personagem">
        <option value="">Todos os personagens</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.huntCount})
          </option>
        ))}
      </select>
      <select
        value={sessionType}
        onChange={(e) => setSessionType(e.target.value)}
        aria-label="Filtrar por tipo de sessão"
      >
        <option value="">Solo + grupo</option>
        <option value="player">Somente solo</option>
        <option value="party">Somente grupo</option>
      </select>
    </div>
  );
}
