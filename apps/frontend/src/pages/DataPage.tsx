import { useEffect, useRef, useState } from 'react';
import { parseHuntJson } from '../jsonParse';
import { exportAllAsJson, importFromJson, type MergeSummary } from '../api/local/backup';
import { deletePlayerData, listPlayerDataSummaries, type PlayerDataSummary } from '../api/local/playerData';
import { useFilters } from '../FiltersContext';

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      payload: unknown;
      counts: { players: number; hunts: number; terrors: number; mds: number; shinyLegacy: number };
      exportedAt: string | null;
    };

type ResultState = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'success'; message: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 hunts novas, 2 já existiam" style summary of what a merge did. */
function mergeMessage(m: MergeSummary): string {
  const store = (r: { imported: number; skipped: number }, one: string, many: string, masc: boolean) =>
    `${plural(r.imported, `${one} ${masc ? 'adicionado' : 'adicionada'}`, `${many} ${masc ? 'adicionados' : 'adicionadas'}`)}` +
    (r.skipped > 0 ? ` (${plural(r.skipped, 'ignorada: já existia ou repetida', 'ignoradas: já existiam ou repetidas')})` : '');
  const parts = [
    `${plural(m.players.added, 'treinador novo', 'treinadores novos')}${m.players.matched > 0 ? ` (${plural(m.players.matched, 'já existia', 'já existiam')})` : ''}`,
    store(m.hunts, 'hunt', 'hunts', false),
    store(m.terrors, 'terror', 'terrors', true),
    store(m.mds, 'MD', 'MDs', true),
  ];
  if (m.shinyLegacy.imported > 0 || m.shinyLegacy.skipped > 0) {
    parts.push(store(m.shinyLegacy, 'hunt do histórico da roleta', 'hunts do histórico da roleta', false));
  }
  const dropped = m.dropped > 0 ? ` ${plural(m.dropped, 'linha do backup foi ignorada', 'linhas do backup foram ignoradas')} por estar inválida.` : '';
  return `Mesclado: ${parts.join(', ')}.${dropped}`;
}

function countsOf(payload: Record<string, unknown>) {
  const arr = (key: string) => (Array.isArray(payload[key]) ? (payload[key] as unknown[]).length : 0);
  return {
    players: arr('players'),
    hunts: arr('hunts'),
    terrors: arr('terrors'),
    mds: arr('mds'),
    shinyLegacy: arr('shinyLegacy'),
  };
}

export function DataPage() {
  const [preview, setPreview] = useState<PreviewState>({ kind: 'idle' });
  const [result, setResult] = useState<ResultState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { player, setPlayer, refreshPlayers } = useFilters();
  const [summaries, setSummaries] = useState<PlayerDataSummary[] | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<ResultState>({ kind: 'idle' });

  async function reloadSummaries() {
    setSummaries(await listPlayerDataSummaries());
  }

  useEffect(() => {
    reloadSummaries().catch(() => setSummaries([]));
  }, []);

  async function doDeletePlayer(p: PlayerDataSummary) {
    setBusy(true);
    setDeleteMsg({ kind: 'idle' });
    try {
      const res = await deletePlayerData(p.id);
      if (player === String(p.id)) setPlayer('');
      refreshPlayers();
      await reloadSummaries();
      setConfirmingDeleteId(null);
      setDeleteMsg({
        kind: 'success',
        message: `${p.name} excluído: ${res.deletedSessions} sessões apagadas (incluindo as de grupo em que ele participou).`,
      });
    } catch (err) {
      setDeleteMsg({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

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

    setPreview({
      kind: 'ready',
      payload,
      counts: countsOf(payload),
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : null,
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
        message: res.merge
          ? mergeMessage(res.merge)
          : `Importado: ${res.counts.players} treinadores, ${res.counts.hunts} hunts, ${res.counts.terrors} terrors, ${res.counts.mds} MDs${
              res.counts.shinyLegacy > 0 ? ` e ${res.counts.shinyLegacy} hunts do histórico da roleta` : ''
            }.`,
      });
      setPreview({ kind: 'idle' });
      setConfirmingReplace(false);
      refreshPlayers();
      reloadSummaries().catch(() => {});
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
      <h1 className="page-title">Dados locais</h1>
      <p className="page-subtitle">
        Este app está rodando no modo standalone: todos os dados ficam salvos só neste navegador (IndexedDB), sem
        nenhum servidor. Use esta página para importar um backup, ou para exportar o que está salvo aqui como
        arquivo de backup.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="section-title">Exportar backup</h2>
        <p className="page-subtitle">Baixa um arquivo .json com tudo que está salvo neste navegador agora.</p>
        <button disabled={busy} onClick={handleExport}>
          Exportar backup
        </button>
      </div>

      <div className="card">
        <h2 className="section-title">Importar backup</h2>
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
              contém: <strong>{preview.counts.players}</strong> treinadores, <strong>{preview.counts.hunts}</strong>{' '}
              hunts, <strong>{preview.counts.terrors}</strong> terrors, <strong>{preview.counts.mds}</strong> MDs
              {preview.counts.shinyLegacy > 0 && (
                <>
                  {' '}
                  e <strong>{preview.counts.shinyLegacy}</strong> hunts do histórico da roleta
                </>
              )}
              .
            </p>

            <p className="page-subtitle">
              Mesclar adiciona o que falta, mantém o que já está aqui, junta os Treinadores pelo nome e pula o que for
              repetido.
            </p>
            <button disabled={busy} onClick={() => doImport('merge')}>
              Importar (mesclar)
            </button>

            {!confirmingReplace ? (
              <button disabled={busy} onClick={() => setConfirmingReplace(true)} style={{ marginLeft: 10 }}>
                Substituir tudo
              </button>
            ) : (
              <span style={{ marginLeft: 10 }}>
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

      <div className="card" style={{ marginTop: 14 }}>
        <h2 className="section-title">Treinadores salvos</h2>
        <p className="page-subtitle">
          Lista de todos os personagens que existem neste navegador. Excluir um treinador apaga as hunts, terrors e
          MDs dele, inclusive as sessões de grupo de outras pessoas em que ele participou.
        </p>

        {deleteMsg.kind === 'error' && <div className="error-box">{deleteMsg.message}</div>}
        {deleteMsg.kind === 'success' && <div className="success-box">{deleteMsg.message}</div>}

        {summaries === null ? (
          <p>Carregando…</p>
        ) : summaries.length === 0 ? (
          <p>Nenhum treinador salvo.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {summaries.map((p) => (
              <li
                key={p.id}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 0' }}
              >
                <span style={{ flex: '1 1 200px' }}>
                  <strong>{p.name}</strong>
                  <br />
                  <span className="page-subtitle">
                    {p.ownedHunts} hunts, {p.ownedTerrors} terrors, {p.ownedMds} MDs
                    {p.ownedShinyLegacy > 0 ? `, ${p.ownedShinyLegacy} hunts do histórico da roleta` : ''}
                    {p.memberSessions > 0 ? `, em ${p.memberSessions} sessões de outros` : ''}
                  </span>
                </span>
                {confirmingDeleteId !== p.id ? (
                  <button className="secondary" disabled={busy} onClick={() => setConfirmingDeleteId(p.id)}>
                    Excluir dados deste treinador
                  </button>
                ) : (
                  <span>
                    Apagar {p.ownedHunts + p.ownedTerrors + p.ownedMds} sessões
                    {p.ownedShinyLegacy > 0 ? ` e ${p.ownedShinyLegacy} hunts do histórico da roleta` : ''} de {p.name}? Não pode
                    ser desfeito.{' '}
                    <button disabled={busy} onClick={() => doDeletePlayer(p)}>
                      Sim, excluir
                    </button>{' '}
                    <button className="secondary" disabled={busy} onClick={() => setConfirmingDeleteId(null)}>
                      Cancelar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
