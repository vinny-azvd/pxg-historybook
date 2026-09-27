import { useState } from 'react';
import { extractTerrorBosses, deriveTerrorName } from '../terrorNaming';
import { formatCompact, formatDateTime, formatDuration, formatInt } from '../format';

interface TerrorExportPreview {
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
  Damage?: { Enemy: string }[];
  'Enemies Defeated'?: { Enemy: string; Count: number; Player: string; Rare?: boolean }[];
}

interface ConfirmTerrorModalProps {
  terror: TerrorExportPreview;
  submitting: boolean;
  errorMessage?: string | null;
  onConfirm: (terrorName: string) => void;
  onCancel: () => void;
}

// The analyzer emits {} (instead of []) when there are no entries.
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function derivePlayers(terror: TerrorExportPreview): string[] {
  const names = new Set<string>();
  for (const row of terror.Experience ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of terror.Supplies ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of terror.Drops ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of asArray(terror['Enemies Defeated'])) if (row.Player) names.add(row.Player.trim());
  return [...names];
}

export function ConfirmTerrorModal({ terror, submitting, errorMessage, onConfirm, onCancel }: ConfirmTerrorModalProps) {
  const damage = asArray(terror.Damage);
  const bosses = extractTerrorBosses(damage);
  const suggested = deriveTerrorName(damage) ?? '';
  const [name, setName] = useState(suggested);

  const players = derivePlayers(terror);
  const session = terror.Session ?? {};

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>Confirmar terror</h2>
        <p className="modal-subtitle">Confira os dados detectados antes de importar. Ajuste o nome se necessário.</p>

        <div className="field-group">
          <label className="field-label" htmlFor="terror-name-input">
            Nome do terror
          </label>
          <input
            id="terror-name-input"
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
          <div>
            <dt>Bosses detectados</dt>
            <dd>{bosses.length > 0 ? bosses.join(', ') : '—'}</dd>
          </div>
        </dl>

        {errorMessage && <div className="error-box">{errorMessage}</div>}

        <div className="modal-actions">
          <button className="secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button onClick={() => onConfirm(name)} disabled={submitting || !name.trim()}>
            {submitting ? 'Importando...' : 'Confirmar e importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
