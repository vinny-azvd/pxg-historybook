import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { TerrorDetail, TerrorListItem } from '../api/types';
import { usePreferences } from '../PreferencesContext';
import { formatCompact, formatDateTime, formatDuration, formatInt } from '../format';
import { ItemIcon } from './ItemIcon';
import { RareDropBadge } from './HuntBadges';

interface TerrorCardProps {
  terror: TerrorListItem;
}

export function TerrorCard({ terror }: TerrorCardProps) {
  const { rareDropThreshold, visibleFields } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TerrorDetail | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle() {
    setExpanded((v) => !v);
    if (!detail && !loading) {
      setLoading(true);
      api.getTerror(terror.id).then(setDetail).finally(() => setLoading(false));
    }
  }

  const rareEnemies = detail?.enemiesDefeated.filter((e) => e.rare) ?? [];
  const rareDropLines = detail?.drops.filter((d) => d.unit_price >= rareDropThreshold) ?? [];

  return (
    <div className="hunt-card" onClick={toggle}>
      <div className="hunt-card-header">
        <Link to={`/terror/${terror.id}`} onClick={(e) => e.stopPropagation()}>
          {terror.terror_name ?? 'Terror'}
        </Link>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{formatDateTime(terror.start_time)}</span>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
        Duração {formatDuration(terror.duration_seconds)} · {terror.players.join(', ')}
        {terror.session_type === 'party' && (
          <>
            {' '}
            <span className="badge">party</span>
          </>
        )}
      </div>

      <div className="hunt-card-badges">
        <RareDropBadge items={terror.top_drops} threshold={rareDropThreshold} />
      </div>

      <dl className="hunt-card-stats">
        <div>
          <dt>Profit</dt>
          <dd>{formatCompact(terror.profit)}</dd>
        </div>
        <div>
          <dt>Profit/h</dt>
          <dd>{formatCompact(terror.profit_per_hour)}</dd>
        </div>
        <div>
          <dt>Kills/h</dt>
          <dd>{formatInt(terror.kills_per_hour)}</dd>
        </div>
        <div>
          <dt>Raros/h</dt>
          <dd>{formatInt(terror.rare_kills_per_hour)}</dd>
        </div>
        {visibleFields.experience && (
          <div>
            <dt>Exp/h</dt>
            <dd>{formatCompact(terror.experience_per_hour)}</dd>
          </div>
        )}
        {visibleFields.damageDealt && (
          <div>
            <dt>Dano causado/s</dt>
            <dd>{formatInt(terror.damage_dealt_per_second)}</dd>
          </div>
        )}
        {visibleFields.damageTaken && (
          <div>
            <dt>Dano recebido/s</dt>
            <dd>{formatInt(terror.damage_taken_per_second)}</dd>
          </div>
        )}
      </dl>

      {expanded && (
        <div className="hunt-card-expanded" onClick={(e) => e.stopPropagation()}>
          {loading || !detail ? (
            <div className="empty-state">Carregando detalhes...</div>
          ) : (
            <>
              <p style={{ fontWeight: 600, fontSize: 12.5, margin: '0 0 6px' }}>
                Raros mortos ({rareEnemies.length})
              </p>
              {rareEnemies.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 10px' }}>Nenhum raro nesse terror.</p>
              ) : (
                <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12.5 }}>
                  {rareEnemies.map((e) => (
                    <li key={e.id}>
                      {e.enemy} × {formatInt(e.count)}
                    </li>
                  ))}
                </ul>
              )}

              <p style={{ fontWeight: 600, fontSize: 12.5, margin: '0 0 6px' }}>
                Drops raros ({rareDropLines.length})
              </p>
              {rareDropLines.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Nenhum drop acima do limiar configurado.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 12.5 }}>
                  {rareDropLines.map((item) => (
                    <li key={item.id} className="item-cell" style={{ marginBottom: 4 }}>
                      <ItemIcon name={item.item} iconUrl={item.icon_url} />
                      {item.item} — {formatCompact(item.unit_price)}/un.
                      {item.count > 1 && <> (× {item.count} = {formatCompact(item.total_price)})</>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
