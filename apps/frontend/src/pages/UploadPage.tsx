import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useFilters } from '../FiltersContext';

type Status =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'duplicate'; huntId: number }
  | { kind: 'success'; huntId: number; players: string[] };

export function UploadPage() {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const { refreshPlayers } = useFilters();

  async function submit(raw: string) {
    setSubmitting(true);
    setStatus({ kind: 'idle' });
    try {
      const payload = JSON.parse(raw.replace(/^﻿/, '').trim());
      const res = await api.uploadHunt(payload);
      if (res.status === 409) {
        setStatus({ kind: 'duplicate', huntId: res.body.existingHuntId });
      } else if (!res.ok) {
        const issues = res.body.issues
          ?.map((i: any) => `${i.path.join('.')}: ${i.message}`)
          .join('\n');
        setStatus({ kind: 'error', message: issues || res.body.error || 'Falha ao importar a hunt.' });
      } else {
        setStatus({ kind: 'success', huntId: res.body.id, players: res.body.players });
        setText('');
        refreshPlayers();
      }
    } catch {
      setStatus({ kind: 'error', message: 'JSON inválido — verifique se colou o arquivo exportado corretamente.' });
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
      submit(content);
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
          Hunt importada com sucesso ({status.players.join(', ')}).{' '}
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
        <button disabled={!text.trim() || submitting} onClick={() => submit(text)}>
          {submitting ? 'Importando...' : 'Importar hunt'}
        </button>
      </div>
    </div>
  );
}
