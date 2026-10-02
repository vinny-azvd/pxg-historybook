// Client-side (IndexedDB-backed) implementation of the `api` object from
// apps/frontend/src/api/client.ts - same function names, same parameter
// shapes, same return shapes (including the `{ok,status,body}` upload
// envelope and the 409 duplicate body), just reading/writing IndexedDB
// instead of talking to the Express backend.
import type {
  CompareResponse,
  Filters,
  HuntDetail,
  HuntListItem,
  HuntListResponse,
  HuntRecord,
  MdDetail,
  MdDifficulty,
  MdListItem,
  MdListResponse,
  MdOverviewStats,
  MdRecord,
  MdWeeklyResponse,
  MonthBucket,
  OverviewStats,
  Player,
  PlayerTrendPoint,
  RareKillRow,
  TerrorDetail,
  TerrorListItem,
  TerrorListResponse,
  TerrorOverviewStats,
  TerrorRecord,
  TerrorWeeklyResponse,
  TrendPoint,
} from '../types';
import { getDb } from './db';
import { createLocalRepository } from './repository';
import { listPlayersWithContentCounts } from './players';
import { getIconUrl, loadIcons } from './icons';
import {
  DuplicateHuntError,
  DuplicateMdError,
  DuplicateTerrorError,
  huntsRepo,
  ingestHunt,
  ingestMd,
  ingestTerror,
  mdsRepo,
  terrorsRepo,
} from './ingestion/ingest';
import { huntExportSchema, mdExportSchema, terrorExportSchema } from './ingestion/validation';
import type { StoredHunt, StoredMd, StoredTerror } from './storedTypes';
import * as huntsAgg from './aggregation/hunts';
import * as terrorsAgg from './aggregation/terrors';
import * as mdsAgg from './aggregation/mds';
import { buildFilterPredicate, jadeSevere, topDrops } from './aggregation/shared';

const MD_DIFFICULTIES = ['Grand Master', 'Master', 'Hyper', 'Ultra', 'Platinum'] as const;

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (a === b) return 0;
  return (a as string | number) < (b as string | number) ? -1 : 1;
}

function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const offset = (page - 1) * pageSize;
  return items.slice(offset, offset + pageSize);
}

function normalizeListParams(filters: { sort?: string; order?: string; page?: number; pageSize?: number }) {
  const pageNum = Math.max(1, Number(filters.page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(filters.pageSize) || 25));
  const order = (filters.order ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;
  return { pageNum, pageSizeNum, order };
}

// --- Hunts ----------------------------------------------------------------

const HUNT_SORT_SELECTORS: Record<string, (h: StoredHunt) => unknown> = {
  start_time: (h) => h.start_time,
  hunt_name: (h) => h.hunt_name,
  profit: (h) => h.profit,
  profit_per_hour: (h) => h.profit_per_hour,
  kills: (h) => h.kills,
  kills_per_hour: (h) => h.kills_per_hour,
  rare_kills_per_hour: (h) => h.rare_kills_per_hour,
  duration_seconds: (h) => h.duration_seconds,
};

function toHuntRecord(h: StoredHunt): HuntRecord {
  return {
    id: h.id,
    session_id: h.session_id,
    hunt_name: h.hunt_name,
    session_type: h.session_type,
    status: h.status,
    start_time: h.start_time,
    duration_seconds: h.duration_seconds,
    paused_seconds: h.paused_seconds,
    kills: h.kills,
    kills_per_hour: h.kills_per_hour,
    rare_kills: h.rare_kills,
    rare_kills_per_hour: h.rare_kills_per_hour,
    experience: h.experience,
    experience_per_hour: h.experience_per_hour,
    damage_dealt: h.damage_dealt,
    damage_dealt_per_second: h.damage_dealt_per_second,
    damage_taken: h.damage_taken,
    damage_taken_per_second: h.damage_taken_per_second,
    supplies_cost: h.supplies_cost,
    supplies_per_hour: h.supplies_per_hour,
    raw_gains: h.raw_gains,
    raw_gains_per_hour: h.raw_gains_per_hour,
    profit: h.profit,
    profit_per_hour: h.profit_per_hour,
    time_to_next_level_seconds: h.time_to_next_level_seconds,
    jade_totem_count: h.jade_totem_count,
  };
}

function toHuntListItem(h: StoredHunt): HuntListItem {
  return {
    id: h.id,
    hunt_name: h.hunt_name,
    session_type: h.session_type,
    status: h.status,
    start_time: h.start_time,
    duration_seconds: h.duration_seconds,
    kills: h.kills,
    kills_per_hour: h.kills_per_hour,
    rare_kills: h.rare_kills,
    rare_kills_per_hour: h.rare_kills_per_hour,
    experience_per_hour: h.experience_per_hour,
    supplies_cost: h.supplies_cost,
    supplies_per_hour: h.supplies_per_hour,
    profit: h.profit,
    profit_per_hour: h.profit_per_hour,
    damage_dealt_per_second: h.damage_dealt_per_second,
    damage_taken_per_second: h.damage_taken_per_second,
    jade_totem_count: h.jade_totem_count,
    jade_severe: jadeSevere(h),
    top_drops: topDrops(h.drops),
    players: h.players.map((p) => p.name),
  };
}

function toHuntDetail(h: StoredHunt): HuntDetail {
  return {
    hunt: toHuntRecord(h),
    players: h.players,
    damage: h.damage,
    supplies: h.supplies,
    drops: h.drops,
    experience: h.experience_entries,
    enemiesDefeated: h.enemies_defeated,
  };
}

// --- Terrors ----------------------------------------------------------------

const TERROR_SORT_SELECTORS: Record<string, (t: StoredTerror) => unknown> = {
  start_time: (t) => t.start_time,
  terror_name: (t) => t.terror_name,
  profit: (t) => t.profit,
  profit_per_hour: (t) => t.profit_per_hour,
  kills: (t) => t.kills,
  kills_per_hour: (t) => t.kills_per_hour,
  rare_kills_per_hour: (t) => t.rare_kills_per_hour,
  duration_seconds: (t) => t.duration_seconds,
};

function toTerrorRecord(t: StoredTerror): TerrorRecord {
  return {
    id: t.id,
    session_id: t.session_id,
    terror_name: t.terror_name,
    session_type: t.session_type,
    status: t.status,
    start_time: t.start_time,
    duration_seconds: t.duration_seconds,
    paused_seconds: t.paused_seconds,
    kills: t.kills,
    kills_per_hour: t.kills_per_hour,
    rare_kills: t.rare_kills,
    rare_kills_per_hour: t.rare_kills_per_hour,
    experience: t.experience,
    experience_per_hour: t.experience_per_hour,
    damage_dealt: t.damage_dealt,
    damage_dealt_per_second: t.damage_dealt_per_second,
    damage_taken: t.damage_taken,
    damage_taken_per_second: t.damage_taken_per_second,
    supplies_cost: t.supplies_cost,
    supplies_per_hour: t.supplies_per_hour,
    raw_gains: t.raw_gains,
    raw_gains_per_hour: t.raw_gains_per_hour,
    profit: t.profit,
    profit_per_hour: t.profit_per_hour,
    time_to_next_level_seconds: t.time_to_next_level_seconds,
  };
}

function toTerrorListItem(t: StoredTerror): TerrorListItem {
  return {
    id: t.id,
    terror_name: t.terror_name,
    session_type: t.session_type,
    status: t.status,
    start_time: t.start_time,
    duration_seconds: t.duration_seconds,
    kills: t.kills,
    kills_per_hour: t.kills_per_hour,
    rare_kills: t.rare_kills,
    rare_kills_per_hour: t.rare_kills_per_hour,
    experience_per_hour: t.experience_per_hour,
    supplies_cost: t.supplies_cost,
    supplies_per_hour: t.supplies_per_hour,
    profit: t.profit,
    profit_per_hour: t.profit_per_hour,
    damage_dealt_per_second: t.damage_dealt_per_second,
    damage_taken_per_second: t.damage_taken_per_second,
    top_drops: topDrops(t.drops),
    players: t.players.map((p) => p.name),
  };
}

function toTerrorDetail(t: StoredTerror): TerrorDetail {
  return {
    terror: toTerrorRecord(t),
    players: t.players,
    damage: t.damage,
    supplies: t.supplies,
    drops: t.drops,
    experience: t.experience_entries,
    enemiesDefeated: t.enemies_defeated,
  };
}

// --- MDs ----------------------------------------------------------------

const MD_SORT_SELECTORS: Record<string, (m: StoredMd) => unknown> = {
  start_time: (m) => m.start_time,
  md_name: (m) => m.md_name,
  profit: (m) => m.profit,
  profit_per_hour: (m) => m.profit_per_hour,
  kills: (m) => m.kills,
  kills_per_hour: (m) => m.kills_per_hour,
  rare_kills_per_hour: (m) => m.rare_kills_per_hour,
  duration_seconds: (m) => m.duration_seconds,
};

function toMdRecord(m: StoredMd): MdRecord {
  return {
    id: m.id,
    session_id: m.session_id,
    md_name: m.md_name,
    difficulty: m.difficulty,
    session_type: m.session_type,
    status: m.status,
    start_time: m.start_time,
    duration_seconds: m.duration_seconds,
    paused_seconds: m.paused_seconds,
    kills: m.kills,
    kills_per_hour: m.kills_per_hour,
    rare_kills: m.rare_kills,
    rare_kills_per_hour: m.rare_kills_per_hour,
    experience: m.experience,
    experience_per_hour: m.experience_per_hour,
    damage_dealt: m.damage_dealt,
    damage_dealt_per_second: m.damage_dealt_per_second,
    damage_taken: m.damage_taken,
    damage_taken_per_second: m.damage_taken_per_second,
    supplies_cost: m.supplies_cost,
    supplies_per_hour: m.supplies_per_hour,
    raw_gains: m.raw_gains,
    raw_gains_per_hour: m.raw_gains_per_hour,
    profit: m.profit,
    profit_per_hour: m.profit_per_hour,
    time_to_next_level_seconds: m.time_to_next_level_seconds,
  };
}

function toMdListItem(m: StoredMd): MdListItem {
  return {
    id: m.id,
    md_name: m.md_name,
    difficulty: m.difficulty,
    session_type: m.session_type,
    status: m.status,
    start_time: m.start_time,
    duration_seconds: m.duration_seconds,
    kills: m.kills,
    kills_per_hour: m.kills_per_hour,
    rare_kills: m.rare_kills,
    rare_kills_per_hour: m.rare_kills_per_hour,
    experience_per_hour: m.experience_per_hour,
    supplies_cost: m.supplies_cost,
    supplies_per_hour: m.supplies_per_hour,
    profit: m.profit,
    profit_per_hour: m.profit_per_hour,
    damage_dealt_per_second: m.damage_dealt_per_second,
    damage_taken_per_second: m.damage_taken_per_second,
    top_drops: topDrops(m.drops),
    players: m.players.map((p) => p.name),
  };
}

function toMdDetail(m: StoredMd): MdDetail {
  return {
    md: toMdRecord(m),
    players: m.players,
    damage: m.damage,
    supplies: m.supplies,
    drops: m.drops,
    experience: m.experience_entries,
    enemiesDefeated: m.enemies_defeated,
  };
}

// --- api object ----------------------------------------------------------

export const api = {
  getPlayers: () => listPlayersWithContentCounts(),

  // Hunts ------------------------------------------------------------------

  getHunts: async (
    filters: Filters & { sort?: string; order?: string; page?: number; pageSize?: number }
  ): Promise<HuntListResponse> => {
    const all = await huntsRepo.list();
    const filtered = all.filter(buildFilterPredicate<StoredHunt>(filters));
    const { pageNum, pageSizeNum, order } = normalizeListParams(filters);
    const selector = HUNT_SORT_SELECTORS[filters.sort ?? 'start_time'] ?? HUNT_SORT_SELECTORS.start_time;
    const sorted = [...filtered].sort((a, b) => order * compareValues(selector(a), selector(b)));
    const pageItems = paginate(sorted, pageNum, pageSizeNum).map(toHuntListItem);
    return { items: pageItems, total: filtered.length, page: pageNum, pageSize: pageSizeNum };
  },

  getHunt: async (id: number): Promise<HuntDetail> => {
    const hunt = await huntsRepo.get(id);
    if (!hunt) throw new Error('not_found');
    return toHuntDetail(hunt);
  },

  renameHunt: async (id: number, huntName: string) => {
    const trimmed = huntName.trim();
    if (!trimmed) throw new Error('Falha ao renomear a hunt');
    const updated = await huntsRepo.rename(id, 'hunt_name', trimmed);
    if (!updated) throw new Error('Falha ao renomear a hunt');
    return { hunt: toHuntRecord(updated) };
  },

  setNightmareCrystalSelections: async (id: number, fromNightmareCrystalIds: number[]) => {
    const hunt = await huntsRepo.get(id);
    const rareRows = hunt?.enemies_defeated.filter((e) => e.rare === 1) ?? [];
    if (!hunt || rareRows.length === 0) throw new Error('Falha ao salvar a seleção do Nightmare Crystal');

    const selected = new Set(fromNightmareCrystalIds);
    const updatedEnemies = hunt.enemies_defeated.map((e) =>
      e.rare === 1 ? { ...e, from_nightmare_crystal: selected.has(e.id) ? 1 : 0 } : e
    );
    const db = await getDb();
    await db.put('hunts', { ...hunt, enemies_defeated: updatedEnemies });
    return { enemiesDefeated: updatedEnemies };
  },

  deleteHunt: async (id: number) => {
    const removed = await huntsRepo.remove(id);
    if (!removed) throw new Error('Falha ao remover hunt');
  },

  uploadHunt: async (payload: unknown) => {
    try {
      const body = payload as Record<string, unknown> | null;
      const isWrapped = body !== null && typeof body === 'object' && 'hunt' in body && typeof body.hunt === 'object';
      const huntPayload = isWrapped ? (body as { hunt: unknown }).hunt : payload;
      const huntNameOverrideRaw = isWrapped ? (body as { huntName?: unknown }).huntName : undefined;
      const huntNameOverride = typeof huntNameOverrideRaw === 'string' ? huntNameOverrideRaw : undefined;
      const crystalSelectionsRaw = isWrapped
        ? (body as { nightmareCrystalSelections?: unknown }).nightmareCrystalSelections
        : undefined;
      const nightmareCrystalSelections = Array.isArray(crystalSelectionsRaw)
        ? crystalSelectionsRaw.filter((v): v is string => typeof v === 'string')
        : undefined;

      const parsed = huntExportSchema.safeParse(huntPayload);
      if (!parsed.success) {
        return { ok: false, status: 400, body: { error: 'invalid_hunt_export', issues: parsed.error.issues } };
      }

      await loadIcons();
      const rawJson = JSON.stringify(huntPayload);
      const result = await ingestHunt(rawJson, parsed.data, huntNameOverride, nightmareCrystalSelections);
      const summary = await huntsRepo.get(result.id);
      return { ok: true, status: 201, body: { ...result, summary } };
    } catch (err) {
      if (err instanceof DuplicateHuntError) {
        return { ok: false, status: 409, body: { error: 'duplicate_hunt', existingHuntId: err.existingHuntId } };
      }
      throw err;
    }
  },

  getOverview: async (filters: Filters): Promise<OverviewStats> =>
    huntsAgg.computeOverview(await huntsRepo.list(), filters),

  getRareKills: async (filters: Filters): Promise<RareKillRow[]> =>
    huntsAgg.computeRareKills(await huntsRepo.list(), filters),

  getMonths: async (filters: { player?: string; sessionType?: string }): Promise<MonthBucket[]> =>
    huntsAgg.computeAvailableMonths(await huntsRepo.list(), filters),

  getTrends: async (filters: Filters & { bucket: string }): Promise<TrendPoint[]> =>
    huntsAgg.computeTrends(await huntsRepo.list(), filters, filters.bucket),

  getTrendsByPlayer: async (filters: Filters & { bucket: string }): Promise<PlayerTrendPoint[]> =>
    huntsAgg.computeTrendsByPlayer(await huntsRepo.list(), filters, filters.bucket),

  getCompare: async (params: {
    player?: string;
    sessionType?: string;
    periodA: { from: string; to: string };
    periodB: { from: string; to: string };
  }): Promise<CompareResponse> => huntsAgg.computeCompare(await huntsRepo.list(), params),

  getUnmatchedItems: async (): Promise<{ item: string; itemNormalized: string; occurrences: number }[]> => {
    await loadIcons();
    const hunts = await huntsRepo.list();
    const groups = new Map<string, { item: string; occurrences: number }>();
    for (const h of hunts) {
      for (const row of [...h.drops, ...h.supplies]) {
        if (getIconUrl(row.item_normalized) !== null) continue;
        const existing = groups.get(row.item_normalized);
        if (existing) existing.occurrences += 1;
        else groups.set(row.item_normalized, { item: row.item, occurrences: 1 });
      }
    }
    return [...groups.entries()]
      .map(([itemNormalized, g]) => ({ item: g.item, itemNormalized, occurrences: g.occurrences }))
      .sort((a, b) => b.occurrences - a.occurrences);
  },

  // Terrors ------------------------------------------------------------------

  getTerrors: async (
    filters: Filters & { sort?: string; order?: string; page?: number; pageSize?: number }
  ): Promise<TerrorListResponse> => {
    const all = await terrorsRepo.list();
    const filtered = all.filter(buildFilterPredicate<StoredTerror>(filters));
    const { pageNum, pageSizeNum, order } = normalizeListParams(filters);
    const selector = TERROR_SORT_SELECTORS[filters.sort ?? 'start_time'] ?? TERROR_SORT_SELECTORS.start_time;
    const sorted = [...filtered].sort((a, b) => order * compareValues(selector(a), selector(b)));
    const pageItems = paginate(sorted, pageNum, pageSizeNum).map(toTerrorListItem);
    return { items: pageItems, total: filtered.length, page: pageNum, pageSize: pageSizeNum };
  },

  getTerror: async (id: number): Promise<TerrorDetail> => {
    const terror = await terrorsRepo.get(id);
    if (!terror) throw new Error('not_found');
    return toTerrorDetail(terror);
  },

  renameTerror: async (id: number, terrorName: string) => {
    const trimmed = terrorName.trim();
    if (!trimmed) throw new Error('Falha ao renomear o terror');
    const updated = await terrorsRepo.rename(id, 'terror_name', trimmed);
    if (!updated) throw new Error('Falha ao renomear o terror');
    return { terror: toTerrorRecord(updated) };
  },

  deleteTerror: async (id: number) => {
    const removed = await terrorsRepo.remove(id);
    if (!removed) throw new Error('Falha ao remover terror');
  },

  uploadTerror: async (payload: unknown) => {
    try {
      const body = payload as Record<string, unknown> | null;
      const isWrapped =
        body !== null && typeof body === 'object' && 'terror' in body && typeof body.terror === 'object';
      const terrorPayload = isWrapped ? (body as { terror: unknown }).terror : payload;
      const terrorNameOverrideRaw = isWrapped ? (body as { terrorName?: unknown }).terrorName : undefined;
      const terrorNameOverride = typeof terrorNameOverrideRaw === 'string' ? terrorNameOverrideRaw : undefined;

      const parsed = terrorExportSchema.safeParse(terrorPayload);
      if (!parsed.success) {
        return { ok: false, status: 400, body: { error: 'invalid_terror_export', issues: parsed.error.issues } };
      }

      await loadIcons();
      const rawJson = JSON.stringify(terrorPayload);
      const result = await ingestTerror(rawJson, parsed.data, terrorNameOverride);
      const summary = await terrorsRepo.get(result.id);
      return { ok: true, status: 201, body: { ...result, summary } };
    } catch (err) {
      if (err instanceof DuplicateTerrorError) {
        return {
          ok: false,
          status: 409,
          body: { error: 'duplicate_terror', existingTerrorId: err.existingTerrorId },
        };
      }
      throw err;
    }
  },

  getTerrorOverview: async (filters: Filters): Promise<TerrorOverviewStats> =>
    terrorsAgg.computeOverview(await terrorsRepo.list(), filters),

  getTerrorTrends: async (filters: Filters & { bucket: string }): Promise<TrendPoint[]> =>
    terrorsAgg.computeTrends(await terrorsRepo.list(), filters, filters.bucket),

  getTerrorTrendsByPlayer: async (filters: Filters & { bucket: string }): Promise<PlayerTrendPoint[]> =>
    terrorsAgg.computeTrendsByPlayer(await terrorsRepo.list(), filters, filters.bucket),

  getTerrorsWeekly: async (filters: Filters & { page?: number; pageSize?: number }): Promise<TerrorWeeklyResponse> => {
    const pageNum = Math.max(1, Number(filters.page) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, Number(filters.pageSize) || 10));
    return terrorsAgg.computeWeeklyGroups(await terrorsRepo.list(), filters, pageNum, pageSizeNum);
  },

  // MDs ------------------------------------------------------------------

  getMds: async (
    filters: Filters & { sort?: string; order?: string; page?: number; pageSize?: number }
  ): Promise<MdListResponse> => {
    const all = await mdsRepo.list();
    const filtered = all.filter(buildFilterPredicate<StoredMd>(filters));
    const { pageNum, pageSizeNum, order } = normalizeListParams(filters);
    const selector = MD_SORT_SELECTORS[filters.sort ?? 'start_time'] ?? MD_SORT_SELECTORS.start_time;
    const sorted = [...filtered].sort((a, b) => order * compareValues(selector(a), selector(b)));
    const pageItems = paginate(sorted, pageNum, pageSizeNum).map(toMdListItem);
    return { items: pageItems, total: filtered.length, page: pageNum, pageSize: pageSizeNum };
  },

  getMd: async (id: number): Promise<MdDetail> => {
    const md = await mdsRepo.get(id);
    if (!md) throw new Error('not_found');
    return toMdDetail(md);
  },

  renameMd: async (id: number, mdName: string) => {
    const trimmed = mdName.trim();
    if (!trimmed) throw new Error('Falha ao renomear a MD');
    const updated = await mdsRepo.rename(id, 'md_name', trimmed);
    if (!updated) throw new Error('Falha ao renomear a MD');
    return { md: toMdRecord(updated) };
  },

  deleteMd: async (id: number) => {
    const removed = await mdsRepo.remove(id);
    if (!removed) throw new Error('Falha ao remover MD');
  },

  uploadMd: async (payload: unknown) => {
    try {
      const body = payload as Record<string, unknown> | null;
      const isWrapped = body !== null && typeof body === 'object' && 'md' in body && typeof body.md === 'object';
      const mdPayload = isWrapped ? (body as { md: unknown }).md : payload;
      const mdNameOverrideRaw = isWrapped ? (body as { mdName?: unknown }).mdName : undefined;
      const mdNameOverride = typeof mdNameOverrideRaw === 'string' ? mdNameOverrideRaw : undefined;
      const difficultyRaw = isWrapped ? (body as { difficulty?: unknown }).difficulty : undefined;
      const difficulty: MdDifficulty | undefined =
        typeof difficultyRaw === 'string' && (MD_DIFFICULTIES as readonly string[]).includes(difficultyRaw)
          ? (difficultyRaw as MdDifficulty)
          : undefined;

      const parsed = mdExportSchema.safeParse(mdPayload);
      if (!parsed.success) {
        return { ok: false, status: 400, body: { error: 'invalid_md_export', issues: parsed.error.issues } };
      }

      await loadIcons();
      const rawJson = JSON.stringify(mdPayload);
      const result = await ingestMd(rawJson, parsed.data, mdNameOverride, difficulty);
      const summary = await mdsRepo.get(result.id);
      return { ok: true, status: 201, body: { ...result, summary } };
    } catch (err) {
      if (err instanceof DuplicateMdError) {
        return { ok: false, status: 409, body: { error: 'duplicate_md', existingMdId: err.existingMdId } };
      }
      throw err;
    }
  },

  getMdOverview: async (filters: Filters): Promise<MdOverviewStats> =>
    mdsAgg.computeOverview(await mdsRepo.list(), filters),

  getMdTrends: async (filters: Filters & { bucket: string }): Promise<TrendPoint[]> =>
    mdsAgg.computeTrends(await mdsRepo.list(), filters, filters.bucket),

  getMdTrendsByPlayer: async (filters: Filters & { bucket: string }): Promise<PlayerTrendPoint[]> =>
    mdsAgg.computeTrendsByPlayer(await mdsRepo.list(), filters, filters.bucket),

  getMdsWeekly: async (filters: Filters & { page?: number; pageSize?: number }): Promise<MdWeeklyResponse> => {
    const pageNum = Math.max(1, Number(filters.page) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, Number(filters.pageSize) || 10));
    return mdsAgg.computeWeeklyGroups(await mdsRepo.list(), filters, pageNum, pageSizeNum);
  },
};
