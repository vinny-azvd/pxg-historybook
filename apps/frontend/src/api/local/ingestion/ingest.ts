// Generic ingestion pipeline mirroring apps/backend/src/services/
// huntIngestion.ts / terrorIngestion.ts / mdIngestion.ts. The three are
// byte-for-byte identical except: hunts carry jade_totem_count +
// from_nightmare_crystal (terror/md don't), and md carries `difficulty`
// (hunt/terror don't) - those deltas are handled by the three thin wrappers
// at the bottom; everything else is shared here.
import { hashPayload } from '../hash';
import { getIconUrl, normalizeItemName } from '../icons';
import { upsertPlayers } from '../players';
import { createLocalRepository } from '../repository';
import { deriveHuntName } from '../../../huntNaming';
import { deriveTerrorName } from '../../../terrorNaming';
import { deriveMdName } from '../../../mdNaming';
import type {
  StoredHunt,
  StoredTerror,
  StoredMd,
  StoredDamageRow,
  StoredItemRow,
  StoredExperienceRow,
  StoredEnemyDefeatedRow,
  StoredHuntEnemyDefeatedRow,
} from '../storedTypes';
import type { MdDifficulty } from '../../types';
import type { HuntExport } from './validation';

export class DuplicateHuntError extends Error {
  constructor(public existingHuntId: number) {
    super('Hunt already imported');
  }
}
export class DuplicateTerrorError extends Error {
  constructor(public existingTerrorId: number) {
    super('Terror already imported');
  }
}
export class DuplicateMdError extends Error {
  constructor(public existingMdId: number) {
    super('Mystery Dungeon already imported');
  }
}

export const huntsRepo = createLocalRepository<StoredHunt>('hunts');
export const terrorsRepo = createLocalRepository<StoredTerror>('terrors');
export const mdsRepo = createLocalRepository<StoredMd>('mds');

function collectPlayerNames(data: HuntExport): Set<string> {
  const names = new Set<string>();
  for (const row of data.Experience) names.add(row.Player.trim());
  for (const row of data.Damage) names.add(row.Player.trim());
  for (const row of data.Supplies) names.add(row.Player.trim());
  for (const row of data.Drops) names.add(row.Player.trim());
  for (const row of data['Enemies Defeated']) names.add(row.Player.trim());
  return names;
}

function primaryPlayerName(data: HuntExport): string | undefined {
  return [...data.Experience].sort((a, b) => b.Experience - a.Experience)[0]?.Player.trim();
}

function resolvePlayer(
  trimmed: string,
  playerIds: Map<string, number>
): { player_id: number | null; player_name: string | null } {
  const id = playerIds.get(trimmed) ?? null;
  return { player_id: id, player_name: id !== null ? trimmed : null };
}

function sortedPlayers(playerIds: Map<string, number>): { id: number; name: string }[] {
  return [...playerIds.entries()]
    .map(([name, id]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildDamageRows(rows: HuntExport['Damage'], playerIds: Map<string, number>): StoredDamageRow[] {
  let id = 1;
  return rows.map((row) => {
    const { player_id, player_name } = resolvePlayer(row.Player.trim(), playerIds);
    return {
      id: id++,
      player_id,
      player_name,
      enemy: row.Enemy,
      element: row.Element,
      damage_dealt: row['Damage dealt'],
      damage_taken: row['Damage taken'],
    };
  });
}

function buildItemRows(rows: HuntExport['Supplies'], playerIds: Map<string, number>): StoredItemRow[] {
  let id = 1;
  return rows.map((row) => {
    const { player_id, player_name } = resolvePlayer(row.Player.trim(), playerIds);
    const normalized = normalizeItemName(row.Item);
    return {
      id: id++,
      player_id,
      player_name,
      item: row.Item,
      item_normalized: normalized,
      count: row.Count,
      unit_price: row['Unit price'],
      total_price: row['Total price'],
      ignored: row.Ignored === null || row.Ignored === undefined ? null : row.Ignored ? 1 : 0,
      icon_url: getIconUrl(normalized),
    };
  });
}

function buildExperienceRows(
  rows: HuntExport['Experience'],
  playerIds: Map<string, number>
): StoredExperienceRow[] {
  let id = 1;
  return rows.map((row) => {
    const { player_id, player_name } = resolvePlayer(row.Player.trim(), playerIds);
    return { id: id++, player_id, player_name, experience: row.Experience };
  });
}

function buildEnemyRows(
  rows: HuntExport['Enemies Defeated'],
  playerIds: Map<string, number>
): StoredEnemyDefeatedRow[] {
  let id = 1;
  return rows.map((row) => {
    const { player_id, player_name } = resolvePlayer(row.Player.trim(), playerIds);
    return {
      id: id++,
      player_id,
      player_name,
      enemy: row.Enemy,
      count: row.Count,
      rare: row.Rare ? 1 : 0,
      ignored: row.Ignored === null || row.Ignored === undefined ? null : row.Ignored ? 1 : 0,
    };
  });
}

// Matched by keyword rather than an exact name, same as the backend: the
// in-game item is "Jade Fortune Totem", not just "Jade Totem", and other
// jade-totem variants may exist.
function isJadeTotemItem(itemName: string): boolean {
  const normalized = normalizeItemName(itemName);
  return normalized.includes('jade') && normalized.includes('totem');
}

function countJadeTotems(hunt: HuntExport): number {
  let count = 0;
  for (const row of hunt.Supplies) if (isJadeTotemItem(row.Item)) count += row.Count;
  for (const row of hunt.Drops) if (isJadeTotemItem(row.Item)) count += row.Count;
  return count;
}

interface SessionDocBase {
  session_id: number | null;
  content_hash: string;
  session_type: 'player' | 'party';
  status: string | null;
  start_time: string;
  duration_seconds: number;
  paused_seconds: number;
  kills: number;
  kills_per_hour: number;
  rare_kills: number;
  rare_kills_per_hour: number;
  experience: number;
  experience_per_hour: number;
  damage_dealt: number;
  damage_dealt_per_second: number;
  damage_taken: number;
  damage_taken_per_second: number;
  supplies_cost: number;
  supplies_per_hour: number;
  raw_gains: number;
  raw_gains_per_hour: number;
  profit: number;
  profit_per_hour: number;
  time_to_next_level_seconds: number | null;
  primary_player_id: number | null;
  raw_json: string;
  imported_at: string;
  players: { id: number; name: string }[];
  damage: StoredDamageRow[];
  supplies: StoredItemRow[];
  drops: StoredItemRow[];
  experience_entries: StoredExperienceRow[];
}

function buildSessionDocBase(
  rawJson: string,
  contentHash: string,
  data: HuntExport,
  playerIds: Map<string, number>,
  primaryPlayerId: number | null
): SessionDocBase {
  const session = data.Session;
  return {
    session_id: session['Session ID'] ?? null,
    content_hash: contentHash,
    session_type: session['Session type'],
    status: session.Status ?? null,
    start_time: session.Start,
    duration_seconds: session['Duration seconds'],
    paused_seconds: session['Paused seconds'] ?? 0,
    kills: session.Kills,
    kills_per_hour: session['Kills per hour'],
    rare_kills: session['Rare kills'],
    rare_kills_per_hour: session['Rare kills per hour'],
    experience: session.Experience,
    experience_per_hour: session['Experience per hour'],
    damage_dealt: session['Damage dealt'],
    damage_dealt_per_second: session['Damage dealt per second'],
    damage_taken: session['Damage taken'],
    damage_taken_per_second: session['Damage taken per second'],
    supplies_cost: session.Supplies,
    supplies_per_hour: session['Supplies per hour'],
    raw_gains: session['Raw gains'],
    raw_gains_per_hour: session['Raw gains per hour'],
    profit: session.Profit,
    profit_per_hour: session['Profit per hour'],
    time_to_next_level_seconds: session['Time to next level seconds'] ?? null,
    primary_player_id: primaryPlayerId,
    raw_json: rawJson,
    imported_at: new Date().toISOString(),
    players: sortedPlayers(playerIds),
    damage: buildDamageRows(data.Damage, playerIds),
    supplies: buildItemRows(data.Supplies, playerIds),
    drops: buildItemRows(data.Drops, playerIds),
    experience_entries: buildExperienceRows(data.Experience, playerIds),
  };
}

export async function ingestHunt(
  rawJson: string,
  hunt: HuntExport,
  huntNameOverride?: string | null,
  nightmareCrystalSelections?: string[]
): Promise<{ id: number; sessionType: string; players: string[]; huntName: string | null }> {
  const contentHash = await hashPayload(rawJson);
  const existing = await huntsRepo.findByHash(contentHash);
  if (existing) throw new DuplicateHuntError(existing.id);

  const playerNames = collectPlayerNames(hunt);
  const playerIds = await upsertPlayers(playerNames);
  const primaryName = primaryPlayerName(hunt);
  const primaryPlayerId = primaryName ? playerIds.get(primaryName) ?? null : null;

  const trimmedOverride = huntNameOverride?.trim();
  const huntName = trimmedOverride
    ? trimmedOverride
    : deriveHuntName(hunt['Enemies Defeated'].map((row) => ({ enemy: row.Enemy, count: row.Count })));

  const crystalSelections = new Set(nightmareCrystalSelections ?? []);
  const enemiesDefeated: StoredHuntEnemyDefeatedRow[] = buildEnemyRows(hunt['Enemies Defeated'], playerIds).map(
    (row) => ({
      ...row,
      from_nightmare_crystal: crystalSelections.has(row.enemy) ? 1 : 0,
    })
  );

  const doc: Omit<StoredHunt, 'id'> = {
    ...buildSessionDocBase(rawJson, contentHash, hunt, playerIds, primaryPlayerId),
    hunt_name: huntName,
    jade_totem_count: countJadeTotems(hunt),
    enemies_defeated: enemiesDefeated,
  };

  const id = await huntsRepo.insert(doc, 'nextHuntId');
  return { id, sessionType: hunt.Session['Session type'], players: [...playerNames], huntName };
}

export async function ingestTerror(
  rawJson: string,
  terror: HuntExport,
  terrorNameOverride?: string | null
): Promise<{ id: number; sessionType: string; players: string[]; terrorName: string | null }> {
  const contentHash = await hashPayload(rawJson);
  const existing = await terrorsRepo.findByHash(contentHash);
  if (existing) throw new DuplicateTerrorError(existing.id);

  const playerNames = collectPlayerNames(terror);
  const playerIds = await upsertPlayers(playerNames);
  const primaryName = primaryPlayerName(terror);
  const primaryPlayerId = primaryName ? playerIds.get(primaryName) ?? null : null;

  const trimmedOverride = terrorNameOverride?.trim();
  const terrorName = trimmedOverride ? trimmedOverride : deriveTerrorName(terror.Damage);

  const doc: Omit<StoredTerror, 'id'> = {
    ...buildSessionDocBase(rawJson, contentHash, terror, playerIds, primaryPlayerId),
    terror_name: terrorName,
    enemies_defeated: buildEnemyRows(terror['Enemies Defeated'], playerIds),
  };

  const id = await terrorsRepo.insert(doc, 'nextTerrorId');
  return { id, sessionType: terror.Session['Session type'], players: [...playerNames], terrorName };
}

export async function ingestMd(
  rawJson: string,
  md: HuntExport,
  mdNameOverride?: string | null,
  difficulty?: MdDifficulty | null
): Promise<{ id: number; sessionType: string; players: string[]; mdName: string | null }> {
  const contentHash = await hashPayload(rawJson);
  const existing = await mdsRepo.findByHash(contentHash);
  if (existing) throw new DuplicateMdError(existing.id);

  const playerNames = collectPlayerNames(md);
  const playerIds = await upsertPlayers(playerNames);
  const primaryName = primaryPlayerName(md);
  const primaryPlayerId = primaryName ? playerIds.get(primaryName) ?? null : null;

  const trimmedOverride = mdNameOverride?.trim();
  const mdName = trimmedOverride ? trimmedOverride : deriveMdName(md.Damage);

  const doc: Omit<StoredMd, 'id'> = {
    ...buildSessionDocBase(rawJson, contentHash, md, playerIds, primaryPlayerId),
    md_name: mdName,
    difficulty: difficulty ?? null,
    enemies_defeated: buildEnemyRows(md['Enemies Defeated'], playerIds),
  };

  const id = await mdsRepo.insert(doc, 'nextMdId');
  return { id, sessionType: md.Session['Session type'], players: [...playerNames], mdName };
}
