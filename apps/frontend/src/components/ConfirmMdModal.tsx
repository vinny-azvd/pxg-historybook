import { useState } from 'react';
import { deriveHuntName } from '../huntNaming';
import { formatCompact, formatDateTime, formatDuration, formatInt } from '../format';

interface MdExportPreview {
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

interface ConfirmMdModalProps {
  md: MdExportPreview;
  submitting: boolean;
  errorMessage?: string | null;
  onConfirm: (mdName: string) => void;
  onCancel: () => void;
}

// The analyzer emits {} (instead of []) when there are no entries.
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function derivePlayers(md: MdExportPreview): string[] {
  const names = new Set<string>();
  for (const row of md.Experience ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of md.Supplies ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of md.Drops ?? []) if (row.Player) names.add(row.Player.trim());
  for (const row of asArray(md['Enemies Defeated'])) if (row.Player) names.add(row.Player.trim());
  return [...names];
}

export function ConfirmMdModal({ md, submitting, errorMessage, onConfirm, onCancel }: ConfirmMdModalProps) {
  const enemies = asArray(md['Enemies Defeated']);
  const suggested = deriveHuntName(enemies.map((e) => ({ enemy: e.Enemy, count: e.Count }))) ?? '';
  const [name, setName] = useState(suggested);

  const players = derivePlayers(md);
  const session = md.Session ?? {};

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>Confirmar MD</h2>
        <p className="modal-subtitle">Confira os dados detectados antes de importar. Ajuste o nome se necessário.</p>

        <div className="field-group">
          <label className="field-label" htmlFor="md-name-input">
            Nome da MD
          </label>
          <input
            id="md-name-input"
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
