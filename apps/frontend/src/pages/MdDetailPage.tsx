import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { MdDetail } from '../api/types';
import { ItemIcon } from '../components/ItemIcon';
import { StatTile } from '../components/StatTile';
import { RareDropBadge } from '../components/HuntBadges';
import { usePreferences } from '../PreferencesContext';
import { formatCompact, formatDateTime, formatDuration, formatInt } from '../format';

export function MdDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MdDetail | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showRareDetail, setShowRareDetail] = useState(false);
  const { rareDropThreshold } = usePreferences();

  useEffect(() => {
    if (!id) return;
    api.getMd(Number(id)).then(setDetail);
  }, [id]);

  if (!detail) return <div className="empty-state">Carregando...</div>;

  const { md, players, damage, supplies, drops, enemiesDefeated } = detail;
  const topDrops = drops.map((d) => ({ item: d.item, unitPrice: d.unit_price }));
  const rareEnemies = enemiesDefeated.filter((e) => e.rare);

  async function handleDelete() {
    if (!confirm('Remover essa MD do histórico? Essa ação não pode ser desfeita.')) return;
    await api.deleteMd(md.id);
    navigate('/md');
  }

  function startEditingName() {
    setNameDraft(md.md_name ?? '');
    setEditingName(true);
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setRenaming(true);
    try {
      await api.renameMd(md.id, trimmed);
      setDetail((prev) => (prev ? { ...prev, md: { ...prev.md, md_name: trimmed } } : prev));
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
              {md.md_name ?? 'MD'}
              {md.session_type === 'party' && (
                <>
                  {' '}
                  <span className="badge">party</span>
                </>
              )}
              {md.difficulty && (
                <>
                  {' '}
                  <span className="badge">{md.difficulty}</span>
                </>
              )}{' '}
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
            {formatDateTime(md.start_time)} · {players.map((p) => p.name).join(', ')} · Duração{' '}
            {formatDuration(md.duration_seconds)}
          </p>
        </div>
        <button className="secondary" onClick={handleDelete}>
          Remover
        </button>
      </div>

      <div className="stat-grid">
        <StatTile label="Profit" value={formatCompact(md.profit)} />
        <StatTile label="Profit/h" value={formatCompact(md.profit_per_hour)} />
        <StatTile label="Kills" value={formatInt(md.kills)} sub={`${formatInt(md.kills_per_hour)}/h`} />
        <StatTile
          label="Raros"
          value={formatInt(md.rare_kills)}
          sub={`${formatInt(md.rare_kills_per_hour)}/h`}
          onClick={() => setShowRareDetail((v) => !v)}
        />
        <StatTile label="Exp/h" value={formatCompact(md.experience_per_hour)} />
        <StatTile label="Suprimentos" value={formatCompact(md.supplies_cost)} sub={`${formatCompact(md.supplies_per_hour)}/h`} />
        <StatTile label="Dano/s (causado)" value={formatInt(md.damage_dealt_per_second)} />
        <StatTile label="Dano/s (recebido)" value={formatInt(md.damage_taken_per_second)} />
      </div>

      {showRareDetail && (
        <div className="section">
          <h2 className="section-title">Raros mortos ({rareEnemies.length})</h2>
          <div className="card">
            {rareEnemies.length === 0 ? (
              <div className="empty-state">Nenhum raro nessa MD.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                {rareEnemies.map((e) => (
                  <li key={e.id}>
                    {e.enemy} × {formatInt(e.count)}
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
        <h2 className="section-title">Inimigos derrotados</h2>
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
                    <td>{e.rare ? 'Sim' : '—'}</td>
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
            {JSON.stringify(md, null, 2)}
          </pre>
        )}
      </div>

      <Link className="muted-link" to="/md">
        ← Voltar ao MD
      </Link>
    </div>
  );
}

function ItemTable({ items }: { items: MdDetail['drops'] }) {
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
