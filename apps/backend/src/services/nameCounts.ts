export interface NameCount {
  name: string;
  count: number;
}

// ASCII unit separator - can't show up in a hunt/MD/terror name, unlike a
// comma or pipe, so splitting GROUP_CONCAT's output back apart is safe.
const SEPARATOR = '\u001f';

/** SELECT fragment collecting every entry name in a GROUP BY bucket, for
 * withNameCounts to turn into a tally ("Sudowoodo x3, Raichu x1"). */
export function namesConcat(column: string): string {
  return `GROUP_CONCAT(COALESCE(${column}, 'Sem nome'), char(31)) AS namesRaw`;
}

export function parseNameCounts(raw: string | null | undefined): NameCount[] {
  if (!raw) return [];
  const counts = new Map<string, number>();
  for (const name of raw.split(SEPARATOR)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Replaces each row's namesRaw (from namesConcat) with a parsed `names` tally. */
export function withNameCounts<T extends { namesRaw?: string | null }>(rows: T[]): (Omit<T, 'namesRaw'> & { names: NameCount[] })[] {
  return rows.map(({ namesRaw, ...rest }) => ({ ...rest, names: parseNameCounts(namesRaw) }));
}
