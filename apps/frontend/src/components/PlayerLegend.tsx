import { usePreferences } from '../PreferencesContext';

export interface PlayerLegendEntry {
  id: number;
  name: string;
  color: string;
}

export function PlayerLegend({ entries }: { entries: PlayerLegendEntry[] }) {
  const { setPlayerColor } = usePreferences();

  return (
    // minHeight keeps this row's footprint the same whether there are 0 or
    // several players, so switching to a period with no hunts (no entries)
    // doesn't shift the chart - and its nav buttons - up underneath the cursor.
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, minHeight: 20, marginBottom: 10 }}>
      {entries.map((e) => (
        <label
          key={e.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}
          title="Clique na cor para personalizar"
        >
          <span style={{ position: 'relative', width: 14, height: 14, display: 'inline-block', flexShrink: 0 }}>
            <input
              type="color"
              value={e.color}
              onChange={(ev) => setPlayerColor(String(e.id), ev.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', border: 0, padding: 0 }}
              aria-label={`Cor de ${e.name}`}
            />
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: e.color,
                border: '1px solid var(--border)',
                pointerEvents: 'none',
              }}
            />
          </span>
          {e.name}
        </label>
      ))}
    </div>
  );
}
