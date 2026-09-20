import { useState } from 'react';
import { deriveHuntName } from '../huntNaming';
import { formatCompact, formatDateTime, formatDuration, formatInt } from '../format';

interface HuntExportPreview {
  Session?: {
    Start?: string;
    'Duration seconds'?: number;
    'Session type'?: 'player' | 'party';
    Profit?: number;
    'Profit per hour'?: number;
    Kills?: number;
    'Rare kills'?: number;
  };
  Experience?: { Player: string; Experience: number }[];
  Supplies?: { Player: string }[];
  Drops?: { Player: string }[];
  'Enemies Defeated'?: { Enemy: string; Count: number; Player: string; Rare?: boolean }[];
}

interface ConfirmHuntModalProps {
  hunt: HuntExportPreview;
  submitting: boolean;
  errorMessage?: string | null;
  onConfirm: (huntName: string, nightmareCrystalSelections: string[]) => void;
  onCancel: () => void;
}

function derivePlayers(hunt: HuntExportPreview): string[] {
  const names = new Set<string>();
  for (const row of hunt.Experience ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of hunt.Supplies ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of hunt.Drops ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of hunt['Enemies Defeated'] ?? []) if (row.Player) names.add(row.Player.trim());
  return [...names];
}

export function ConfirmHuntModal({ hunt, submitting, errorMessage, onConfirm, onCancel }: ConfirmHuntModalProps) {
  const enemies = hunt['Enemies Defeated'] ?? [];
  const suggested = deriveHuntName(enemies.map((e) => ({ enemy: e.Enemy, count: e.Count }))) ?? '';
  const [name, setName] = useState(suggested);
  const [crystalSelections, setCrystalSelections] = useState<Set<string>>(new Set());

  const players = derivePlayers(hunt);
  const session = hunt.Session ?? {};

  const hasNightmareCrystal = enemies.some((e) => e.Enemy.toLowerCase().includes('nightmare crystal'));
  const rareEntries = enemies.filter((e) => e.Rare && !e.Enemy.toLowerCase().includes('nightmare crystal'));

  function toggleCrystalSelection(enemy: string) {
    setCrystalSelections((prev) => {
      const next = new Set(prev);
      if (next.has(enemy)) next.delete(enemy);
      else next.add(enemy);
      return next;
    });
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>Confirmar hunt</h2>
        <p className="modal-subtitle">Confira os dados detectados antes de importar. Ajuste o nome se necessário.</p>

        <div className="field-group">
          <label className="field-label" htmlFor="hunt-name-input">
            Nome da hunt
          </label>
          <input
            id="hunt-name-input"
            type="text"
            style={{ width: '100%' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <dl className="preview-grid">
          <div>
            <dt>Data</dt>
            <dd>{session.Start ? formatDateTime(session.Start) : '—'}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{session['Duration seconds'] !== undefined ? formatDuration(session['Duration seconds']) : '—'}</dd>
          </div>
          <div>
            <dt>Personagem(s)</dt>
            <dd>
              {players.join(', ') || '—'}
              {session['Session type'] === 'party' ? ' (party)' : ''}
            </dd>
          </div>
          <div>
            <dt>Profit</dt>
            <dd>
              {formatCompact(session.Profit)} ({formatCompact(session['Profit per hour'])}/h)
            </dd>
          </div>
          <div>
            <dt>Kills</dt>
            <dd>{formatInt(session.Kills)}</dd>
          </div>
          <div>
            <dt>Raros</dt>
            <dd>{formatInt(session['Rare kills'])}</dd>
          </div>
        </dl>

        {hasNightmareCrystal && rareEntries.length > 0 && (
          <div className="field-group">
            <p style={{ fontSize: 13, margin: '0 0 6px' }}>
              Essa hunt usou <strong>Nightmare Crystal</strong>, que gera 2 shinies aleatórios. Marque abaixo quais
              raros vieram do cristal (e não do bicho normal da hunt):
            </p>
            {rareEntries.map((e, i) => (
              <label key={`${e.Enemy}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={crystalSelections.has(e.Enemy)}
                  onChange={() => toggleCrystalSelection(e.Enemy)}
                />
                {e.Enemy} (× {e.Count})
              </label>
            ))}
          </div>
        )}

        {errorMessage && <div className="error-box">{errorMessage}</div>}

        <div className="modal-actions">
          <button className="secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button onClick={() => onConfirm(name, [...crystalSelections])} disabled={submitting || !name.trim()}>
            {submitting ? 'Importando...' : 'Confirmar e importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
