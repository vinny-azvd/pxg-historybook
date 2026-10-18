import { POKEMON_TYPES, typeColor, typeLabel, type PokemonType } from '../pokemon';

interface TypeFilterProps {
  selected: ReadonlySet<PokemonType>;
  onChange: (next: Set<PokemonType>) => void;
}

// Multi-select chips for the 18 Pokémon types, shared by the Raros tabs. A
// Pokémon matches when ANY of its types is selected (a Fire/Flying one shows
// under Fogo and under Voador). None selected means "every type" (the "Todos"
// chip), so the filter never empties the page by itself. The type name is
// always written - the dot only repeats the type colour, never carries meaning.
export function TypeFilter({ selected, onChange }: TypeFilterProps) {
  function toggle(type: PokemonType) {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(next);
  }
  return (
    <div className="chart-toolbar-group" role="group" aria-label="Filtrar por elemento">
      <span className="chart-toolbar-label">Elemento</span>
      <div className="bucket-toggle type-filter-chips">
        <button type="button" className={selected.size === 0 ? '' : 'secondary'} aria-pressed={selected.size === 0} onClick={() => onChange(new Set())}>
          Todos
        </button>
        {POKEMON_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={selected.has(type) ? '' : 'secondary'}
            aria-pressed={selected.has(type)}
            onClick={() => toggle(type)}
          >
            <span className="type-filter-dot" style={{ background: typeColor(type) }} aria-hidden="true" />
            {typeLabel(type)}
          </button>
        ))}
      </div>
    </div>
  );
}
