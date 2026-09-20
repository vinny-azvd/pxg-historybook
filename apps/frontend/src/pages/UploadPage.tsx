import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';
import { parseHuntJson } from '../jsonParse';
import { ConfirmHuntModal } from '../components/ConfirmHuntModal';

type Status =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'duplicate'; huntId: number }
  | { kind: 'success'; huntId: number; players: string[]; huntName: string | null };

export function UploadPage() {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
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

  async function confirmUpload(huntName: string, nightmareCrystalSelections: string[]) {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await api.uploadHunt({ hunt: pendingHunt, huntName, nightmareCrystalSelections });
      if (res.status === 409) {
        setPendingHunt(null);
        setStatus({ kind: 'duplicate', huntId: res.body.existingHuntId });
      } else if (!res.ok) {
        const issues = res.body.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n');
        setModalError(issues || res.body.error || 'Falha ao importar a hunt.');
      } else {
        setPendingHunt(null);
        setStatus({ kind: 'success', huntId: res.body.id, players: res.body.players, huntName: res.body.huntName });
        setText('');
        refreshPlayers();
      }
    } catch (err) {
      setModalError(`Falha ao enviar a hunt para o servidor: ${err instanceof Error ? err.message : String(err)}`);
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
    <div>
      <h1 className="page-title">Importar hunt</h1>
      <p className="page-subtitle">Cole o JSON exportado do analyzer ou arraste o arquivo .json aqui.</p>

      {status.kind === 'error' && <div className="error-box">{status.message}</div>}
      {status.kind === 'duplicate' && (
        <div className="error-box">
          Essa hunt já foi importada antes. <Link to={`/hunts/${status.huntId}`}>Ver hunt existente</Link>
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
        rows={16}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }}
        placeholder="Cole aqui o JSON exportado da hunt..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button disabled={!text.trim()} onClick={() => parseAndPreview(text)}>
          Importar hunt
        </button>
      </div>

      {pendingHunt && (
        <ConfirmHuntModal
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
    </div>
  );
}
