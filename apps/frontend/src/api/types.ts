export interface Player {
  id: number;
  name: string;
  huntCount: number;
}

export interface TopDrop {
  item: string;
  unitPrice: number;
}

export interface HuntListItem {
  id: number;
  hunt_name: string | null;
  session_type: 'player' | 'party';
  status: string | null;
  start_time: string;
  duration_seconds: number;
  kills: number;
  kills_per_hour: number;
  rare_kills: number;
  rare_kills_per_hour: number;
  experience_per_hour: number;
  supplies_cost: number;
  supplies_per_hour: number;
  profit: number;
  profit_per_hour: number;
  damage_dealt_per_second: number;
  damage_taken_per_second: number;
  jade_totem_count: number;
  jade_severe: boolean;
  top_drops: TopDrop[];
  players: string[];
}

export interface HuntListResponse {
  items: HuntListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HuntRecord {
  id: number;
  session_id: number | null;
  hunt_name: string | null;
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
  jade_totem_count: number;
}

export interface ItemLine {
  id: number;
  item: string;
  player_name: string | null;
  count: number;
  unit_price: number;
  total_price: number;
  icon_url: string | null;
}

export interface DamageLine {
  id: number;
  player_name: string | null;
  enemy: string;
  element: string;
  damage_dealt: number;
  damage_taken: number;
}

export interface EnemyDefeatedLine {
  id: number;
  player_name: string | null;
  enemy: string;
  count: number;
  rare: number;
  from_nightmare_crystal: number;
}

export interface HuntDetail {
  hunt: HuntRecord;
  players: { id: number; name: string }[];
  damage: DamageLine[];
  supplies: ItemLine[];
  drops: ItemLine[];
  experience: { player_name: string | null; experience: number }[];
  enemiesDefeated: EnemyDefeatedLine[];
}

export interface OverviewStats {
  huntCount: number;
  totalDurationSeconds: number;
  totalProfit: number;
  avgProfitPerHour: number | null;
  maxProfitPerHour: number | null;
  totalKills: number;
  avgKillsPerHour: number | null;
  maxKillsPerHour: number | null;
  maxKills: number | null;
  totalRareKills: number;
  avgRareKillsPerHour: number | null;
  maxRareKillsPerHour: number | null;
  maxRareKills: number | null;
  avgExperiencePerHour: number | null;
  avgSuppliesPerHour: number | null;
  avgDamageDealtPerSecond: number | null;
  avgDamageTakenPerSecond: number | null;
  mostProfitableHunt: { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  leastProfitableHunt: { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  mostFrequentHunt: { huntName: string; count: number } | null;
}

export interface RareKillRow {
  id: number;
  huntId: number;
  huntName: string | null;
  startTime: string;
  enemy: string;
  count: number;
  fromNightmareCrystal: boolean;
}

export interface MonthBucket {
  month: string;
  huntCount: number;
}

export interface PlayerTrendPoint {
  playerId: number;
  playerName: string;
  bucketStart: string;
  huntCount: number;
  totalProfit: number;
  avgProfitPerHour: number | null;
  avgKillsPerHour: number | null;
  avgRareKillsPerHour: number | null;
  avgExperiencePerHour: number | null;
  avgSuppliesPerHour: number | null;
}

export interface TrendPoint {
  bucketStart: string;
  huntCount: number;
  totalProfit: number;
  avgProfitPerHour: number | null;
  avgKillsPerHour: number | null;
  avgRareKillsPerHour: number | null;
  avgExperiencePerHour: number | null;
  avgSuppliesPerHour: number | null;
  huntId?: number;
  huntName?: string | null;
  jadeTotemCount?: number;
  jadeSevere?: boolean;
  topDrops?: TopDrop[];
}

export interface CompareDelta {
  diff: number;
  percent: number | null;
}

export interface CompareResponse {
  periodA: { range: { from?: string; to?: string }; stats: OverviewStats };
  periodB: { range: { from?: string; to?: string }; stats: OverviewStats };
  delta: {
    avgProfitPerHour: CompareDelta | null;
    avgKillsPerHour: CompareDelta | null;
    avgRareKillsPerHour: CompareDelta | null;
    avgExperiencePerHour: CompareDelta | null;
    totalProfit: CompareDelta | null;
  };
}

export interface Filters {
  player?: string;
  from?: string;
  to?: string;
  sessionType?: string;
}

export interface TerrorListItem {
  id: number;
  terror_name: string | null;
  session_type: 'player' | 'party';
  status: string | null;
  start_time: string;
  duration_seconds: number;
  kills: number;
  kills_per_hour: number;
  rare_kills: number;
  rare_kills_per_hour: number;
  experience_per_hour: number;
  supplies_cost: number;
  supplies_per_hour: number;
  profit: number;
  profit_per_hour: number;
  damage_dealt_per_second: number;
  damage_taken_per_second: number;
  top_drops: TopDrop[];
  players: string[];
}

export interface TerrorListResponse {
  items: TerrorListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TerrorRecord {
  id: number;
  session_id: number | null;
  terror_name: string | null;
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
}

export interface TerrorEnemyDefeatedLine {
  id: number;
  player_name: string | null;
  enemy: string;
  count: number;
  rare: number;
}

export interface TerrorDetail {
  terror: TerrorRecord;
  players: { id: number; name: string }[];
  damage: DamageLine[];
  supplies: ItemLine[];
  drops: ItemLine[];
  experience: { player_name: string | null; experience: number }[];
  enemiesDefeated: TerrorEnemyDefeatedLine[];
}

export interface TerrorOverviewStats {
  terrorCount: number;
  totalDurationSeconds: number;
  totalProfit: number;
  avgProfitPerHour: number | null;
  maxProfitPerHour: number | null;
  totalKills: number;
  avgKillsPerHour: number | null;
  maxKillsPerHour: number | null;
  maxKills: number | null;
  totalRareKills: number;
  avgRareKillsPerHour: number | null;
  maxRareKillsPerHour: number | null;
  maxRareKills: number | null;
  avgExperiencePerHour: number | null;
  avgSuppliesPerHour: number | null;
  avgDamageDealtPerSecond: number | null;
  avgDamageTakenPerSecond: number | null;
  mostProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  leastProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string } | null;
  mostFrequentTerror: { terrorName: string; count: number } | null;
}

export interface TerrorRareKillRow {
  id: number;
  terrorId: number;
  terrorName: string | null;
  startTime: string;
  enemy: string;
  count: number;
}
