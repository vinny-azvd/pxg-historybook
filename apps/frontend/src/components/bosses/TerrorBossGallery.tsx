import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { TerrorBossFights } from '../../api/types';
import { useFilters } from '../../FiltersContext';
import { terrorBosses } from '../../bossImages';
import { formatDateTime, formatInt } from '../../format';
import { WEEKLY_TERROR_BOSSES, terrorBossForEnemy } from '../../terrorNames';

/**
 * "Bosses do Terror": the wiki banners of the bosses DEFEATED in the selected
 * period, each with how many rotations it was done in. An export lists the
 * whole rotation, so "done" = damage was dealt to that boss in that rotation.
 * The weekly Nightmare Terrors that were not done are listed below, by name.
 * Reuses the Raros gallery card (every skin already styles .rares-gallery-card
 * / -sprite / -name); the rest is under "Bosses" in styles.css. Renders
 * nothing when there are no banners (a build made without bd/bosses).
 */
export function TerrorBossGallery() {
  const { player, sessionType, from, to } = useFilters();
  const bosses = terrorBosses();
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [data, setData] = useState<{ key: string; fights: TerrorBossFights } | null>(null);
  const key = `${player}|${sessionType}|${from}|${to}`;

  useEffect(() => {
    let ignore = false;
    api
      .getTerrorBossFights({ player, sessionType, from, to })
      .then((fights) => {
        if (!ignore) setData({ key, fights });
      })
      .catch(() => {
        if (!ignore) setData({ key, fights: { rotations: 0, fights: [] } });
      });
    return () => {
      ignore = true;
    };
  }, [player, sessionType, from, to, key]);

  if (bosses.length === 0) return null;

  // Several enemy rows can be one boss (the Seishin & Yurei pair): the boss is
  // done in a rotation when any of its rows was hit, so take the highest count.
  const done = new Map<string, { count: number; lastAt: string }>();
  for (const fight of data?.fights.fights ?? []) {
    const boss = terrorBossForEnemy(fight.enemy);
    if (!boss) continue;
    const prev = done.get(boss);
    done.set(boss, {
      count: Math.max(prev?.count ?? 0, fight.count),
      lastAt: prev && prev.lastAt > fight.lastAt ? prev.lastAt : fight.lastAt,
    });
  }

  const order = new Map(bosses.map((b, i) => [b.name, i]));
  const cards = bosses
    .filter((b) => done.has(b.name) && !failed.has(b.name))
    .sort((a, b) => done.get(b.name)!.count - done.get(a.name)!.count || order.get(a.name)! - order.get(b.name)!);
  const missing = WEEKLY_TERROR_BOSSES.filter((name) => !done.has(name));
  const stale = data?.key !== key;
  const totalFights = [...done.values()].reduce((sum, d) => sum + d.count, 0);

  return (
    <section className="section boss-gallery-section" aria-labelledby="boss-gallery-title" aria-busy={stale} style={stale ? { opacity: 0.6 } : undefined}>
      <h2 className="section-title" id="boss-gallery-title">
        Bosses derrotados no período
        {data && !stale && <span className="num"> ({formatInt(totalFights)})</span>}
      </h2>
      {!data ? (
        <div className="empty-state">Carregando...</div>
      ) : cards.length === 0 ? (
        <div className="empty-state">Nenhum boss derrotado no período selecionado.</div>
      ) : (
        <ul className="rares-gallery boss-gallery">
          {cards.map((boss) => {
            const info = done.get(boss.name)!;
            return (
              <li key={boss.name} className="rares-gallery-card boss-gallery-card">
                <img
                  className="boss-banner rares-gallery-sprite"
                  src={boss.src}
                  width={boss.width}
                  height={boss.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onError={() => setFailed((prev) => new Set(prev).add(boss.name))}
                />
                <span className="rares-gallery-name" title={boss.name}>
                  {boss.name}
                </span>
                <span className="badge boss-gallery-badge" title={`Última vez: ${formatDateTime(info.lastAt)}`}>
                  × {formatInt(info.count)}
                </span>
                {boss.legendaryDog && <span className="badge boss-gallery-badge">Cão lendário</span>}
              </li>
            );
          })}
        </ul>
      )}
      {data && !stale && data.fights.rotations > 0 && missing.length > 0 && (
        <p className="boss-gallery-credit">Nightmare Terrors não feitos no período: {missing.join(', ')}.</p>
      )}
      <p className="boss-gallery-credit">Banners: wiki.pokexgames.com</p>
    </section>
  );
}
