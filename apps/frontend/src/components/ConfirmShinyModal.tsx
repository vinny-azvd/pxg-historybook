import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { deriveHuntName } from '../huntNaming';
import { detectShinyHunt, type EnemyRow } from '../shinyHunt';
import { variantBadges } from '../pokemon';
import { formatClock, formatDateTime, formatInt } from '../format';
import { PokemonSprite } from './PokemonSprite';
import { baseName } from './rares/RareSprite';
import { TierBadge } from './TierBadge';

interface ShinyExportPreview {
  Session?: { Start?: string; 'Duration seconds'?: number; 'Session type'?: 'player' | 'party'; Kills?: number };
  Experience?: { Player: string }[];
  Supplies?: { Player: string }[];
  Drops?: { Player: string }[];
  'Enemies Defeated'?: { Enemy: string; Count: number; Player: string; Rare?: boolean }[];
}

interface ConfirmShinyModalProps {
  hunt: ShinyExportPreview;
  submitting: boolean;
  errorMessage?: string | null;
  onConfirm: (huntName: string, shinyTarget: string) => void;
  onCancel: () => void;
}

// The analyzer emits {} (instead of []) when there are no entries.
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function derivePlayers(hunt: ShinyExportPreview): string[] {
  const names = new Set<string>();
  const lists = [
    asArray(hunt.Experience),
    asArray(hunt.Supplies),
    asArray(hunt.Drops),
    asArray(hunt['Enemies Defeated']),
  ];
  for (const list of lists) for (const row of list) if (row.Player) names.add(row.Player.trim());
  return [...names];
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

export function ConfirmShinyModal({ hunt, submitting, errorMessage, onConfirm, onCancel }: ConfirmShinyModalProps) {
  const { rows, suggestedName } = useMemo(() => {
    const enemies = asArray(hunt['Enemies Defeated']);
    return {
      rows: enemies.map((e): EnemyRow => ({ enemy: e.Enemy, count: e.Count, rare: Boolean(e.Rare) })),
      suggestedName: deriveHuntName(enemies.map((e) => ({ enemy: e.Enemy, count: e.Count }))) ?? '',
    };
  }, [hunt]);
  const [name, setName] = useState(suggestedName);

  const { candidates, targetSpecies: suggestedTarget } = useMemo(() => detectShinyHunt(rows), [rows]);
  // A hunt with kills but no shiny yet still counts for the averages, so the
  // picker falls back to the most farmed species. There is no "no target".
  const [picked, setPicked] = useState<string | null>(null);
  const target = picked ?? suggestedTarget ?? candidates[0]?.species ?? null;
  const detection = useMemo(() => detectShinyHunt(rows, target), [rows, target]);

  const players = derivePlayers(hunt);
  const session = hunt.Session ?? {};

  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;
  const titleId = useId();
  const descId = useId();
  const nameId = useId();
  const targetId = useId();

  // Focus moves into the dialog and goes back to what opened it. Escape closes
  // (unless an import is in flight) and Tab stays inside, as aria-modal says.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('select, input')?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (submittingRef.current) return;
        e.preventDefault();
        cancelRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        // Everything is disabled while submitting: keep focus in the dialog.
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const outside = !dialog.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const noCandidates = candidates.length === 0;
  const canConfirm = !submitting && !noCandidates && target !== null && Boolean(name.trim());

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
      <div className="modal-card shiny-modal" ref={dialogRef} tabIndex={-1}>
        <h2 id={titleId}>Confirmar hunt shiny</h2>
        <p className="modal-subtitle" id={descId}>
          Confira o alvo detectado e os shinies encontrados antes de importar.
        </p>

        <div className="field-group">
          <label className="field-label" htmlFor={nameId}>
            Nome da hunt
          </label>
          <input
            id={nameId}
            type="text"
            style={{ width: '100%' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <dl className="preview-grid">
          <div>
            <dt>Data</dt>
            <dd>{session.Start ? formatDateTime(session.Start) : '—'}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{session['Duration seconds'] !== undefined ? formatClock(session['Duration seconds']) : '—'}</dd>
          </div>
          <div>
            <dt>Treinador(es)</dt>
            <dd>
              {players.join(', ') || '—'}
              {session['Session type'] === 'party' ? ' (party)' : ''}
            </dd>
          </div>
          <div>
            <dt>Kills</dt>
            <dd>{formatInt(session.Kills)}</dd>
          </div>
        </dl>

        {noCandidates ? (
          <div className="error-box" role="alert">
            Não encontrei nenhum Pokémon nessa hunt para ser o alvo. Confira se o JSON é de uma hunt com inimigos
            derrotados.
          </div>
        ) : (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor={targetId}>
                Alvo da hunt shiny
              </label>
              <select
                id={targetId}
                value={target ?? ''}
                onChange={(e) => setPicked(e.target.value)}
                disabled={submitting}
              >
                {candidates.map((c) => (
                  <option key={c.species} value={c.species}>
                    {c.label} - {formatInt(c.shinies)} {c.shinies === 1 ? 'shiny' : 'shinies'} · {formatInt(c.normalKills)}{' '}
                    kills
                  </option>
                ))}
              </select>
            </div>

            <h3 className="field-label">Shinies dessa hunt</h3>
            {detection.finds.length === 0 ? (
              <p className="shinies-note">Nenhum shiny nessa sessão: ela entra nas médias só com as kills do alvo.</p>
            ) : (
              <ul className="shiny-finds" aria-live="polite">
                {detection.finds.map((find) => {
                  const badges = variantBadges(find.name);
                  return (
                    <li key={find.name}>
                      <PokemonSprite name={find.name} alt="" width={32} />
                      <span className="shiny-find-name">{baseName(find.name)}</span>
                      {badges.length > 0 && (
                        <span className="rare-badges">
                          {badges.map((badge) => (
                            <span key={badge} className="badge rare-badge">
                              {badge}
                            </span>
                          ))}
                        </span>
                      )}
                      <TierBadge tier={find.tier} removed={find.removed} />
                      <span className="shinies-find-role">
                        {find.isTarget ? 'Alvo' : find.isTargetCompanion ? 'Companion do alvo' : 'Na mesma hunt'}
                      </span>
                      <span className="shiny-find-count num">× {formatInt(find.count)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {errorMessage && (
          <div className="error-box" role="alert">
            {errorMessage}
          </div>
        )}

        <div className="modal-actions">
          <button className="secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button onClick={() => target && onConfirm(name, target)} disabled={!canConfirm}>
            {submitting ? 'Importando...' : 'Confirmar e importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
