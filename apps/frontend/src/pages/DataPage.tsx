import { useRef, useState } from 'react';
import { parseHuntJson } from '../jsonParse';
import { exportAllAsJson, importFromJson } from '../api/local/backup';
import { getDb } from '../api/local/db';

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      payload: unknown;
      counts: { players: number; hunts: number; terrors: number; mds: number };
      exportedAt: string | null;
      storesEmpty: boolean;
    };

type ResultState = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'success'; message: string };

async function areLocalStoresEmpty(): Promise<boolean> {
  const db = await getDb();
  const [players, hunts, terrors, mds] = await Promise.all([
    db.count('players'),
    db.count('hunts'),
    db.count('terrors'),
    db.count('mds'),
  ]);
  return players === 0 && hunts === 0 && terrors === 0 && mds === 0;
}

function countsOf(payload: Record<string, unknown>) {
  const arr = (key: string) => (Array.isArray(payload[key]) ? (payload[key] as unknown[]).length : 0);
  return { players: arr('players'), hunts: arr('hunts'), terrors: arr('terrors'), mds: arr('mds') };
}

export function DataPage() {
  const [preview, setPreview] = useState<PreviewState>({ kind: 'idle' });
  const [result, setResult] = useState<ResultState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setResult({ kind: 'idle' });
    const text = await file.text();
    await handleText(text);
  }

  async function handleText(text: string) {
    setResult({ kind: 'idle' });
    const parsed = parseHuntJson(text);
    if (!parsed.ok) {
      setPreview({ kind: 'error', message: parsed.message! });
      return;
    }
    const payload = parsed.data as Record<string, unknown>;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !Array.isArray(payload.players) ||
      !Array.isArray(payload.hunts) ||
      !Array.isArray(payload.terrors) ||
      !Array.isArray(payload.mds)
    ) {
      setPreview({
        kind: 'error',
        message:
          'JSON válido, mas não parece um backup do pxg-hunts: faltam os campos "players", "hunts", "terrors" ou "mds".',
      });
      return;
    }

    const storesEmpty = await areLocalStoresEmpty();
    setPreview({
      kind: 'ready',
      payload,
      counts: countsOf(payload),
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : null,
      storesEmpty,
    });
  }

  async function doImport(mode: 'merge' | 'replace') {
    if (preview.kind !== 'ready') return;
    setBusy(true);
    setResult({ kind: 'idle' });
    try {
      const res = await importFromJson(preview.payload, mode);
      setResult({
        kind: 'success',
        message: `Importado: ${res.counts.players} jogadores, ${res.counts.hunts} hunts, ${res.counts.terrors} terrors, ${res.counts.mds} MDs.`,
      });
      setPreview({ kind: 'idle' });
      setConfirmingReplace(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setResult({ kind: 'idle' });
    try {
      const payload = await exportAllAsJson();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `pxg-hunts-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setResult({ kind: 'success', message: 'Backup exportado e baixado com sucesso.' });
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Dados locais</h1>
      <p className="page-subtitle">
        Este app está rodando no modo standalone: todos os dados ficam salvos só neste navegador (IndexedDB), sem
        nenhum servidor. Use esta página para importar um backup, ou para exportar o que está salvo aqui como
        arquivo de backup.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Exportar backup</h2>
        <p className="page-subtitle">Baixa um arquivo .json com tudo que está salvo neste navegador agora.</p>
        <button disabled={busy} onClick={handleExport}>
          Exportar backup
        </button>
      </div>

      <div className="card">
        <h2>Importar backup</h2>
        <p className="page-subtitle">
          Escolha o arquivo .json exportado (pelo backend com <code>npm run export</code>, ou por esta mesma tela em
          outro momento).
        </p>

        {result.kind === 'error' && <div className="error-box">{result.message}</div>}
        {result.kind === 'success' && <div className="success-box">{result.message}</div>}
        {preview.kind === 'error' && <div className="error-box">{preview.message}</div>}

        <div
          className="upload-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          Arraste o arquivo .json do backup aqui, ou escolha abaixo
        </div>

        <div style={{ marginTop: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {preview.kind === 'ready' && (
          <div style={{ marginTop: 14 }}>
            <p>
              Backup {preview.exportedAt ? `de ${preview.exportedAt} ` : ''}
              contém: <strong>{preview.counts.players}</strong> jogadores, <strong>{preview.counts.hunts}</strong>{' '}
              hunts, <strong>{preview.counts.terrors}</strong> terrors, <strong>{preview.counts.mds}</strong> MDs.
            </p>

            {preview.storesEmpty ? (
              <button disabled={busy} onClick={() => doImport('merge')}>
                Importar (mesclar)
              </button>
            ) : (
              <p className="error-box">
                Já existem dados salvos neste navegador. Para importar este backup, use "Substituir tudo" abaixo
                (apaga o que está salvo aqui antes de importar).
              </p>
            )}

            {!confirmingReplace ? (
              <button disabled={busy} onClick={() => setConfirmingReplace(true)} style={{ marginLeft: preview.storesEmpty ? 10 : 0 }}>
                Substituir tudo
              </button>
            ) : (
              <span style={{ marginLeft: preview.storesEmpty ? 10 : 0 }}>
                Tem certeza? Isso vai apagar tudo que está salvo neste navegador agora e não pode ser desfeito.{' '}
                <button disabled={busy} onClick={() => doImport('replace')}>
                  Sim, substituir tudo
                </button>{' '}
                <button disabled={busy} onClick={() => setConfirmingReplace(false)}>
                  Cancelar
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
