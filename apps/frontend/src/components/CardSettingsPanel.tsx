import { useState } from 'react';
import { usePreferences } from '../PreferencesContext';

export function CardSettingsPanel() {
  const { rareDropThreshold, visibleFields, setRareDropThreshold, setVisibleField } = usePreferences();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button className="secondary" onClick={() => setOpen((v) => !v)}>
        ⚙ Exibição
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            zIndex: 10,
            width: 260,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="rare-drop-threshold">
              Limiar de drop raro
            </label>
            <input
              id="rare-drop-threshold"
              type="number"
              min={0}
              step={1000}
              style={{ width: '100%' }}
              value={rareDropThreshold}
              onChange={(e) => setRareDropThreshold(Number(e.target.value) || 0)}
            />
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 6px' }}>Campos opcionais no card</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={visibleFields.experience}
              onChange={(e) => setVisibleField('experience', e.target.checked)}
            />
            Experiência/h
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={visibleFields.damageDealt}
              onChange={(e) => setVisibleField('damageDealt', e.target.checked)}
            />
            Dano causado/s
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={visibleFields.damageTaken}
              onChange={(e) => setVisibleField('damageTaken', e.target.checked)}
            />
            Dano recebido/s
          </label>
        </div>
      )}
    </div>
  );
}
