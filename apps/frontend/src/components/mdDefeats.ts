import type { MdListItem } from '../api/types';

/** Unique MD records per boss (md_name): how many times each boss was defeated
 * among the given runs. */
export function countByBoss(items: Pick<MdListItem, 'id' | 'md_name'>[]): Map<string, number> {
  const seen = new Set<number>();
  const counts = new Map<string, number>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const key = item.md_name ?? '';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
