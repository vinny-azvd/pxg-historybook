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
  // Recomputed as rare_kills ÷ hours (0 for a zero-length session) in hunt,
  // terror and MD lists/records alike - the export's own field is floored to
  // an integer and is never served.
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

// Every avg*PerHour / avg*PerSecond here, in TrendPoint/PlayerTrendPoint
// day/week/month buckets and in CompareResponse is total ÷ time played over
// the group, not a mean of per-hunt rates. Per-hunt trend points carry that
// hunt's own rate (Raros/h recomputed from rare_kills, see HuntListItem).
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
  totalExperience: number;
  mostProfitableHunt: { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  leastProfitableHunt: { id: number; huntName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
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

// ---------- Página Raros ----------
// Rares are whatever the game export flags `rare` (never inferred from the
// name - "Giant Mamoswine" isn't rare but "Giant Porygon" is). Hunts and MDs
// both have them; Terror rotations don't flag any today.
export type RareOrigin = 'hunt' | 'md';

export interface RaresFilters extends Filters {
  origin?: 'all' | RareOrigin;
  bucket: 'day' | 'week' | 'month';
}

/** One rare kill row as exported (one enemy name inside one hunt/MD). */
export interface RareEvent {
  id: string; // `${origin}-${entryId}-${enemies_defeated.id}`, unique across origins and sessions
  origin: RareOrigin;
  entryId: number; // hunt id or md id
  entryName: string | null; // hunt_name / md_name
  startTime: string;
  enemy: string; // raw exported name, e.g. "Shiny Muk"
  count: number;
  fromNightmareCrystal: boolean; // user annotation, hunts only
  /** From the old roulette's history: `entryId` is not a hunt id, so there is no page to link. */
  legacy?: boolean;
}

/** Every rare with the same exported enemy name, aggregated. */
export interface RareSpeciesRow {
  enemy: string;
  origins: RareOrigin[];
  count: number;
  nightmareCrystalCount: number;
  lastAt: string; // latest startTime it appeared in
  entryNames: NameCount[]; // hunts/MDs it came from, most frequent first
}

/** Rares per hunt/MD name, for "Raros/h por hunt". Rate = total ÷ hours. */
export interface RareEntryRow {
  name: string;
  origin: RareOrigin;
  sessions: number;
  rareKills: number; // session-level rare_kills (includes unidentified ones)
  durationSeconds: number;
  rareKillsPerHour: number | null;
}

export interface RareTimelinePoint {
  bucketStart: string;
  hunt: number;
  md: number;
  /** Sum of the sessions' duration in this bucket (real + legacy hunts, MDs):
   * a rare count alone isn't comparable between buckets without the time played. */
  durationSeconds: number;
}

export interface RaresSummary {
  /** Session-level counts (hunts.rare_kills + mds.rare_kills). */
  totalRareKills: number;
  /** Sum of the per-enemy rare rows - can be lower than the total when an
   * export counted rares without listing which enemy they were. */
  identifiedRareKills: number;
  unidentifiedRareKills: number;
  totalDurationSeconds: number;
  rareKillsPerHour: number | null;
  sessions: number;
  sessionsWithRares: number;
  nightmareCrystalRares: number;
  /** "Nightmare Crystal" enemy rows (not rare themselves) - crystals broken. */
  nightmareCrystalsBroken: number;
  lastRare: RareEvent | null;
  species: RareSpeciesRow[]; // most kills first
  byEntry: RareEntryRow[]; // highest Raros/h first
  timeline: RareTimelinePoint[]; // only buckets with sessions; the chart fills gaps
  events: RareEvent[]; // newest first
}

export interface MonthBucket {
  month: string;
  huntCount: number;
}

// How many entries of each name (hunt spot, MD, terror rotation) fell into
// one day/week/month bucket - shown in chart tooltips, most frequent first.
export interface NameCount {
  name: string;
  count: number;
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
  huntId?: number;
  huntName?: string | null;
  // Day/week/month buckets only - entry buckets carry huntName instead.
  names?: NameCount[];
  topDrops?: TopDrop[];
  // Terror-only: per-rotation totals/averages instead of Hunts' per-hour rates.
  avgProfit?: number | null;
  avgExperience?: number | null;
  avgSupplies?: number | null;
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
  // Day/week/month buckets only - entry buckets carry huntName instead.
  names?: NameCount[];
  jadeTotemCount?: number;
  jadeSevere?: boolean;
  topDrops?: TopDrop[];
  // Terror-only: per-rotation totals/averages instead of Hunts' per-hour rates.
  avgProfit?: number | null;
  avgKills?: number | null;
  avgRareKills?: number | null;
  avgExperience?: number | null;
  avgSupplies?: number | null;
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

// ---------- Página Shinies ----------
// Built from hunts whose `shiny_target` was confirmed on import (local mode
// only). Tiers come from the roulette catalog (shinyTiers.ts). "Kills por
// shiny" divides the kills of the Pokémon's own species (normal + shiny/mega
// rows) by its shinies, so a shared hunt isn't charged to every find; the
// shinies/h rate only exists for targets, because the session time belongs to
// what was being farmed. All rates are ratio-of-sums, null when undefined.
import type { ShinyTier } from '../shinyTiers';
import type { PokemonType } from '../pokemon';

/** Shinies filters: the shared ones plus an optional tier selection ("out" =
 * "Fora da roleta"). Empty or missing = every tier. */
export type ShinyTierFilter = ShinyTier | 'out';
/** `types` = optional element selection (a find qualifies with ANY selected
 * type); combined with `tiers` by AND. Empty or missing = every element. */
export type ShinyFilters = Filters & { tiers?: ShinyTierFilter[]; types?: PokemonType[] };

export interface ShinyPokemonRow {
  /** Canonical name: "Shiny Gengar", "Mega Scizor". */
  name: string;
  tier: ShinyTier | null;
  removed: boolean;
  /** Hunts where it dropped or was the target. */
  hunts: number;
  /** Kills of its species in those hunts. */
  kills: number;
  shinies: number;
  killsPerShiny: number | null;
  /** Hunts where it was the target, with the session time and shinies of those. */
  targetHunts: number;
  targetShinies: number;
  targetDurationSeconds: number;
  shiniesPerHour: number | null;
}

export interface ShinyTierRow {
  /** null = "Fora da roleta". */
  tier: ShinyTier | null;
  pokemon: number; // distinct Pokémon with at least one shiny
  hunts: number;
  kills: number;
  shinies: number;
  killsPerShiny: number | null;
}

export interface ShinyHuntFind {
  name: string;
  count: number;
  tier: ShinyTier | null;
  isTarget: boolean;
  isTargetCompanion: boolean;
  /** Only set (true) while a tier filter is on and this find is in another tier. */
  outsideFilter?: boolean;
}

export interface ShinyHuntRow {
  /** Hunt id, or the legacy record id when `legacy` (it has no detail page). */
  id: number;
  /** From the old roulette's history (loaded once, outside the app), not a real export. */
  legacy: boolean;
  huntName: string | null;
  startTime: string;
  durationSeconds: number;
  sessionKills: number;
  players: string[];
  targetName: string | null; // "Shiny Gengar"
  targetTier: ShinyTier | null;
  targetShinies: number;
  finds: ShinyHuntFind[]; // target first
}

export interface ShinyStats {
  hunts: number;
  shinies: number;
  sessionKills: number;
  durationSeconds: number;
  /** Over targets only: target kills ÷ target shinies. */
  killsPerShiny: number | null;
  shiniesPerHour: number | null;
  pokemon: ShinyPokemonRow[]; // most shinies first
  tiers: ShinyTierRow[]; // catalog order, "Fora da roleta" last
  huntList: ShinyHuntRow[]; // newest first
  /** Only present while an element filter is on: Pokémon (distinct) left out
   * because their types are unknown. */
  unknownTypePokemon?: number;
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
  totalProfit: number;
  avgProfit: number | null;
  maxProfit: number | null;
  avgExperience: number | null;
  totalExperience: number;
  avgNightmareTokens: number | null;
  mostProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  leastProfitableTerror: { id: number; terrorName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  mostFrequentTerror: { terrorName: string; count: number } | null;
}

export interface TerrorWeeklySummary {
  weekStart: string;
  terrorCount: number;
  totalProfit: number;
  avgProfit: number | null;
}

export interface TerrorWeeklyResponse {
  items: TerrorWeeklySummary[];
  total: number;
}

export type MdDifficulty = 'Grand Master' | 'Master' | 'Hyper' | 'Ultra' | 'Platinum';

export interface MdListItem {
  id: number;
  md_name: string | null;
  difficulty: MdDifficulty | null;
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

export interface MdListResponse {
  items: MdListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MdRecord {
  id: number;
  session_id: number | null;
  md_name: string | null;
  difficulty: MdDifficulty | null;
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

export interface MdEnemyDefeatedLine {
  id: number;
  player_name: string | null;
  enemy: string;
  count: number;
  rare: number;
}

export interface MdDetail {
  md: MdRecord;
  players: { id: number; name: string }[];
  damage: DamageLine[];
  supplies: ItemLine[];
  drops: ItemLine[];
  experience: { player_name: string | null; experience: number }[];
  enemiesDefeated: MdEnemyDefeatedLine[];
}

export interface MdOverviewStats {
  mdCount: number;
  totalProfit: number;
  avgProfit: number | null;
  maxProfit: number | null;
  avgExperience: number | null;
  totalExperience: number;
  mostProfitableMd: { id: number; mdName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  leastProfitableMd: { id: number; mdName: string | null; profit: number; profitPerHour: number; startTime: string; players: string[] } | null;
  mostFrequentMd: { mdName: string; count: number } | null;
}

export interface MdWeeklySummary {
  weekStart: string;
  mdCount: number;
  totalProfit: number;
  avgProfit: number | null;
  // Total rares ÷ hours across the week's runs.
  avgRareKillsPerHour: number | null;
}

export interface MdWeeklyResponse {
  items: MdWeeklySummary[];
  total: number;
}

// One row per distinct hunt/MD name - the "Por hunt"/"Por MD" comparison
// chart. avgProfitPerHour and avgRareKillsPerHour are weighted by duration
// (hours hunted), avgProfit is the plain per-run average.
export interface NameBreakdownRow {
  name: string;
  count: number;
  totalDurationSeconds: number;
  totalProfit: number;
  avgProfitPerHour: number | null;
  avgProfit: number | null;
  avgRareKillsPerHour: number | null;
}

/** Terror rotations in a period and, per enemy, in how many of them damage was
 * dealt to it (the way to tell which bosses were done: the export lists the
 * whole rotation, not only the kills). */
export interface TerrorBossFight {
  enemy: string;
  count: number;
  lastAt: string;
}

export interface TerrorBossFights {
  rotations: number;
  fights: TerrorBossFight[];
}
