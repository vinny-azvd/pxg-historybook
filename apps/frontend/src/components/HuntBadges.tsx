import type { TopDrop } from '../api/types';
import { formatCompact } from '../format';

interface JadeBadgeProps {
  count: number;
  severe: boolean;
}

export function JadeBadge({ count, severe }: JadeBadgeProps) {
  if (count <= 0) return null;
  const title = severe
    ? `${count} Jade Totem consumido${count === 1 ? '' : 's'} — cobriu só parte da hunt, loot/hora inflado`
    : `${count} Jade Totem consumido${count === 1 ? '' : 's'}`;
  return (
    <span className={`badge ${severe ? 'badge-jade-severe' : 'badge-jade'}`} title={title}>
      🟢 Jade Totem
    </span>
  );
}

interface RareDropBadgeProps {
  items: TopDrop[];
  threshold: number;
}

export function RareDropBadge({ items, threshold }: RareDropBadgeProps) {
  const rareItems = getRareDrops(items, threshold);
  if (rareItems.length === 0) return null;
  const title = rareItems.map((i) => `${i.item} (${formatCompact(i.unitPrice)}/un.)`).join(', ');
  return (
    <span className="badge badge-rare-drop" title={title}>
      💎 Drop raro{rareItems.length > 1 ? `s (${rareItems.length})` : ''}
    </span>
  );
}

/** "Rare" is judged by the item's unit price, not the total dropped: 1000
 * units of a 10k item are ordinary loot, not a lucky rare drop. */
export function getRareDrops(items: TopDrop[], threshold: number): TopDrop[] {
  return items.filter((i) => i.unitPrice >= threshold);
}
