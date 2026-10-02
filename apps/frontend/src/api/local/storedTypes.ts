import type { MdDifficulty } from '../types';

// Denormalized, per-session documents persisted in IndexedDB. Each one holds
// everything HuntDetail/TerrorDetail/MdDetail (api/types.ts) needs, plus the
// raw payload, so reads never need a join - unlike the backend's normalized
// SQLite tables, there's exactly one record per hunt/terror/md.

export interface StoredPlayer {
  id: number;
  name: string;
  created_at: string;
}

export interface StoredDamageRow {
  id: number;
  player_id: number | null;
  player_name: string | null;
  enemy: string;
  element: string;
  damage_dealt: number;
  damage_taken: number;
}

export interface StoredItemRow {
  id: number;
  player_id: number | null;
  player_name: string | null;
  item: string;
  item_normalized: string;
  count: number;
  unit_price: number;
  total_price: number;
  ignored: number | null;
  icon_url: string | null;
}

export interface StoredExperienceRow {
  id: number;
  player_id: number | null;
  player_name: string | null;
  experience: number;
}

export interface StoredEnemyDefeatedRow {
  id: number;
  player_id: number | null;
  player_name: string | null;
  enemy: string;
  count: number;
  rare: number;
  ignored: number | null;
}

export interface StoredHuntEnemyDefeatedRow extends StoredEnemyDefeatedRow {
  from_nightmare_crystal: number;
}

interface StoredSessionBase {
  id: number;
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

export interface StoredHunt extends StoredSessionBase {
  hunt_name: string | null;
  jade_totem_count: number;
  enemies_defeated: StoredHuntEnemyDefeatedRow[];
}

export interface StoredTerror extends StoredSessionBase {
  terror_name: string | null;
  enemies_defeated: StoredEnemyDefeatedRow[];
}

export interface StoredMd extends StoredSessionBase {
  md_name: string | null;
  difficulty: MdDifficulty | null;
  enemies_defeated: StoredEnemyDefeatedRow[];
}
