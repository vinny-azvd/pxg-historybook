import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { HuntDetail } from '../api/types';
import { ItemIcon } from '../components/ItemIcon';
import { StatTile } from '../components/StatTile';
import { JadeBadge, RareDropBadge } from '../components/HuntBadges';
import { usePreferences } from '../PreferencesContext';
import { formatCompact, formatDateTime, formatDuration, formatInt } from '../format';

export function HuntDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<HuntDetail | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [editingCrystal, setEditingCrystal] = useState(false);
  const [crystalDraft, setCrystalDraft] = useState<Set<number>>(new Set());
  const [savingCrystal, setSavingCrystal] = useState(false);
  const [showRareDetail, setShowRareDetail] = useState(false);
  const { rareDropThreshold } = usePreferences();

  useEffect(() => {
    if (!id) return;
    api.getHunt(Number(id)).then(setDetail);
  }, [id]);

  if (!detail) return <div className="empty-state">Carregando...</div>;

  const { hunt, players, damage, supplies, drops, enemiesDefeated } = detail;
  const jadeSevere = hunt.jade_totem_count > 0 && hunt.jade_totem_count * 3600 < hunt.duration_seconds;
  const topDrops = drops.map((d) => ({ item: d.item, unitPrice: d.unit_price }));
  const hasNightmareCrystal = enemiesDefeated.some((e) => e.enemy.toLowerCase().includes('nightmare crystal'));
  const rareEnemies = enemiesDefeated.filter((e) => e.rare);

  function startEditingCrystal() {
    setCrystalDraft(new Set(rareEnemies.filter((e) => e.from_nightmare_crystal).map((e) => e.id)));
    setEditingCrystal(true);
  }

  function toggleCrystalDraft(enemyId: number) {
    setCrystalDraft((prev) => {
      const next = new Set(prev);
      if (next.has(enemyId)) next.delete(enemyId);
      else next.add(enemyId);
      return next;
    });
  }

  async function saveCrystalSelection() {
    setSavingCrystal(true);
    try {
      const res = await api.setNightmareCrystalSelections(hunt.id, [...crystalDraft]);
      setDetail((prev) => (prev ? { ...prev, enemiesDefeated: res.enemiesDefeated } : prev));
      setEditingCrystal(false);
    } finally {
      setSavingCrystal(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Remover esta hunt do histórico? Essa ação não pode ser desfeita.')) return;
    await api.deleteHunt(hunt.id);
    navigate('/hunts');
  }

  function startEditingName() {
    setNameDraft(hunt.hunt_name ?? '');
    setEditingName(true);
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setRenaming(true);
    try {
      await api.renameHunt(hunt.id, trimmed);
      setDetail((prev) => (prev ? { ...prev, hunt: { ...prev.hunt, hunt_name: trimmed } } : prev));
      setEditingName(false);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          {editingName ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <input
                type="text"
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                style={{ fontSize: 20, fontWeight: 700, padding: '4px 8px' }}
              />
              <button onClick={saveName} disabled={renaming || !nameDraft.trim()}>
                Salvar
              </button>
              <button className="secondary" onClick={() => setEditingName(false)} disabled={renaming}>
                Cancelar
              </button>
            </div>
          ) : (
            <h1 className="page-title">
              {hunt.hunt_name ?? 'Hunt'}
              {hunt.session_type === 'party' && (
                <>
                  {' '}
                  <span className="badge">party</span>
                </>
              )}{' '}
              <JadeBadge count={hunt.jade_totem_count} severe={jadeSevere} />{' '}
              <RareDropBadge items={topDrops} threshold={rareDropThreshold} />{' '}
              <button
                className="secondary"
                onClick={startEditingName}
                style={{ fontSize: 12, padding: '3px 8px', verticalAlign: 'middle' }}
              >
                Renomear
              </button>
            </h1>
          )}
          <p className="page-subtitle">
            {formatDateTime(hunt.start_time)} · {players.map((p) => p.name).join(', ')} · Duração{' '}
            {formatDuration(hunt.duration_seconds)}
          </p>
        </div>
        <button className="secondary" onClick={handleDelete}>
          Remover
        </button>
      </div>

      <div className="stat-grid">
        <StatTile label="Profit" value={formatCompact(hunt.profit)} />
        <StatTile label="Profit/h" value={formatCompact(hunt.profit_per_hour)} />
        <StatTile label="Kills" value={formatInt(hunt.kills)} sub={`${formatInt(hunt.kills_per_hour)}/h`} />
        <StatTile
          label="Raros"
          value={formatInt(hunt.rare_kills)}
          sub={`${formatInt(hunt.rare_kills_per_hour)}/h`}
          onClick={() => setShowRareDetail((v) => !v)}
        />
        <StatTile label="Exp/h" value={formatCompact(hunt.experience_per_hour)} />
        <StatTile label="Suprimentos" value={formatCompact(hunt.supplies_cost)} sub={`${formatCompact(hunt.supplies_per_hour)}/h`} />
        <StatTile label="Dano/s (causado)" value={formatInt(hunt.damage_dealt_per_second)} />
        <StatTile label="Dano/s (recebido)" value={formatInt(hunt.damage_taken_per_second)} />
      </div>

      {showRareDetail && (
        <div className="section">
          <h2 className="section-title">Raros mortos ({rareEnemies.length})</h2>
          <div className="card">
            {rareEnemies.length === 0 ? (
              <div className="empty-state">Nenhum raro nessa hunt.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                {rareEnemies.map((e) => (
                  <li key={e.id}>
                    {e.enemy} × {formatInt(e.count)}
                    {!!e.from_nightmare_crystal && (
                      <>
                        {' '}
                        <span className="badge badge-jade" title="Spawn aleatório do Nightmare Crystal">
                          via Nightmare Crystal
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="section">
          <h2 className="section-title">Drops ({drops.length})</h2>
          <div className="card">
            <ItemTable items={drops} />
          </div>
        </div>
        <div className="section">
          <h2 className="section-title">Suprimentos usados ({supplies.length})</h2>
          <div className="card">
            <ItemTable items={supplies} />
          </div>
        </div>
      </div>

      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Inimigos derrotados
          </h2>
          {hasNightmareCrystal && rareEnemies.length > 0 && !editingCrystal && (
            <button className="secondary" onClick={startEditingCrystal} style={{ fontSize: 12, padding: '3px 8px' }}>
              Marcar raros do Nightmare Crystal
            </button>
          )}
        </div>
        {editingCrystal && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>
              Essa hunt teve <strong>Nightmare Crystal</strong>, que gera 2 shinies aleatórios. Marque quais raros
              abaixo vieram do cristal:
            </p>
            {rareEnemies.map((e) => (
              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={crystalDraft.has(e.id)}
                  onChange={() => toggleCrystalDraft(e.id)}
                />
                {e.enemy} (× {e.count})
              </label>
            ))}
            <div className="modal-actions" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={() => setEditingCrystal(false)} disabled={savingCrystal}>
                Cancelar
              </button>
              <button onClick={saveCrystalSelection} disabled={savingCrystal}>
                {savingCrystal ? 'Salvando...' : 'Salvar seleção'}
              </button>
            </div>
          </div>
        )}
        <div className="card">
          {enemiesDefeated.length === 0 ? (
            <div className="empty-state">Sem dados.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inimigo</th>
                  <th>Quantidade</th>
                  <th>Raro</th>
                </tr>
              </thead>
              <tbody>
                {enemiesDefeated.map((e) => (
                  <tr key={e.id}>
                    <td>{e.enemy}</td>
                    <td>{formatInt(e.count)}</td>
                    <td>
                      {e.rare ? 'Sim' : '—'}
                      {!!e.from_nightmare_crystal && (
                        <>
                          {' '}
                          <span className="badge badge-jade" title="Spawn aleatório do Nightmare Crystal">
                            via Nightmare Crystal
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">Dano por elemento</h2>
        <div className="card">
          {damage.length === 0 ? (
            <div className="empty-state">Sem dados.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inimigo</th>
                  <th>Elemento</th>
                  <th>Dano causado</th>
                  <th>Dano recebido</th>
                </tr>
              </thead>
              <tbody>
                {damage.map((d) => (
                  <tr key={d.id}>
                    <td>{d.enemy}</td>
                    <td>{d.element}</td>
                    <td>{formatInt(d.damage_dealt)}</td>
                    <td>{formatInt(d.damage_taken)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="section">
        <button className="secondary" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Ocultar JSON bruto' : 'Ver JSON bruto'}
        </button>
        {showRaw && (
          <pre className="card" style={{ marginTop: 12, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(hunt, null, 2)}
          </pre>
        )}
      </div>

      <Link className="muted-link" to="/hunts">
        ← Voltar ao histórico
      </Link>
    </div>
  );
}

function ItemTable({ items }: { items: HuntDetail['drops'] }) {
  if (items.length === 0) return <div className="empty-state">Sem itens.</div>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qtd</th>
          <th>Preço unit.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <div className="item-cell">
                <ItemIcon name={item.item} iconUrl={item.icon_url} />
                {item.item}
              </div>
            </td>
            <td>{formatInt(item.count)}</td>
            <td>{formatCompact(item.unit_price)}</td>
            <td>{formatCompact(item.total_price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
