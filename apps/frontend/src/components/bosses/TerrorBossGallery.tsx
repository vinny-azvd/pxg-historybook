import { useState } from 'react';
import { terrorBosses } from '../../bossImages';

/**
 * "Bosses do Terror": the wiki banners of the Terror/Besta bosses as a
 * collection grid. Reuses the Raros gallery card (every skin already styles
 * .rares-gallery-card / -sprite / -name); the rest is under "Bosses" in
 * styles.css. Renders nothing when there are no banners or none of them load
 * (a build made without bd/bosses).
 */
export function TerrorBossGallery() {
  const bosses = terrorBosses();
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const visible = bosses.filter((b) => !failed.has(b.name));
  if (visible.length === 0) return null;

  return (
    <section className="section boss-gallery-section" aria-labelledby="boss-gallery-title">
      <h2 className="section-title" id="boss-gallery-title">
        Bosses do Terror
      </h2>
      <ul className="rares-gallery boss-gallery">
        {visible.map((boss) => (
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
            {boss.legendaryDog && <span className="badge boss-gallery-badge">Cão lendário</span>}
          </li>
        ))}
      </ul>
      <p className="boss-gallery-credit">Banners: wiki.pokexgames.com</p>
    </section>
  );
}
