// Stats for the Shinies tab: only hunts whose `shiny_target` was confirmed on
// import count. Every rate is a ratio of sums (never an average of per-session
// rates) and null when its denominator is 0. Kills are charged per species, not
// per session, so a shared hunt (Gengar + Haunter + Gastly) doesn't bill the
// whole session to each find. Records from the old roulette's history
// (StoredShinyLegacy) feed the very same numbers: one record is a hunt with its
// target and, when it has one, its companion (Shiny X / Mega X spawn together,
// so both share the record's kills).
import type {
  ShinyHuntFind,
  ShinyFilters,
  ShinyHuntRow,
  ShinyPokemonRow,
  ShinyStats,
  ShinyTierRow,
} from '../../types';
import type { StoredHunt, StoredShinyLegacy } from '../storedTypes';
import { detectShinyHunt, identity, type EnemyRow } from '../../../shinyHunt';
import { pokemonTypes, type PokemonType } from '../../../pokemon';
import { SHINY_TIERS, squashName, tierOf, type ShinyTier } from '../../../shinyTiers';
import { filterLegacy, gameSpelling } from './legacy';
import { buildFilterPredicate, sum } from './shared';

interface PokemonAcc extends ShinyPokemonRow {
  /** Hunt scopes ("h:12" real, "l:3" legacy: their ids overlap) it appeared in,
   * to count each hunt once. */
  huntIds: Set<string>;
  /** Target shinies of hunts that have a duration: the numerator of shinies/h,
   * since a hunt with no time must not inflate the rate. */
  timedShinies: number;
  /** The name is spelled as a real export spells it (preferred for display). */
  fromExport: boolean;
}

interface TierAcc {
  huntIds: Set<string>;
  /** Squashed names of the Pokémon with at least one shiny. */
  withShinies: Set<string>;
  /** (hunt, species) pairs already charged, so Shiny X + Mega X of one species
   * in the same hunt count their kills once. */
  chargedKills: Set<string>;
  kills: number;
  shinies: number;
}

/** One Pokémon's contribution to one hunt (real or legacy). */
interface Charge {
  name: string;
  tier: ShinyTier | null;
  removed: boolean;
  /** Species identity used to charge a hunt's kills once per tier. */
  speciesKey: string;
  count: number;
  isTarget: boolean;
  kills: number;
  durationSeconds: number;
  fromExport: boolean;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR');
}

/** Display name for a species key that no row of the hunt spells out any more
 * (the stored target outlived the rows): "gengar" -> "Gengar". */
function labelFromKey(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1);
}

// Tier filter (filter.tiers, empty = off). A hunt (real or legacy record) is
// KEPT when at least one of its entries is in a selected tier; an entry is a
// find, or the target / companion even with 0 shinies (a failed hunt of a
// selected tier must stay, it is the denominator of kills per shiny). For kept
// hunts only entries in selected tiers feed the Pokémon rows, the tier rows and
// the shinies total; the top-level killsPerShiny / shiniesPerHour use only
// targets whose own tier is selected; hunts, sessionKills and durationSeconds
// are over kept hunts. The hunt list shows kept hunts with ALL their finds, and
// flags the ones outside the selection with `outsideFilter` (shown muted).
// Element filter (filter.types, empty = off) works the same way, keyed on the
// Pokémon's types (pokemonTypes(name): mega / regional aware) instead of its
// tier: a find qualifies when its Pokémon has ANY selected type AND, if a tier
// filter is on, it is in a selected tier. Everything above applies with
// "in a selected tier" read as "qualifies" (a 0-shiny target counts as an entry
// of its own types). A Pokémon with no known types never qualifies while an
// element is selected; `unknownTypePokemon` says how many were left out for it.
// With no filter nothing is flagged and the output is the unfiltered one.
export function computeShinyStats(hunts: StoredHunt[], legacy: StoredShinyLegacy[], filter: ShinyFilters): ShinyStats {
  const selected = filter.tiers && filter.tiers.length > 0 ? new Set<ShinyTier | 'out'>(filter.tiers) : null;
  const inSel = (tier: ShinyTier | null) => !selected || selected.has(tier ?? 'out');
  const typeSel = filter.types && filter.types.length > 0 ? new Set<PokemonType>(filter.types) : null;
  // Squashed names of Pokémon (past the tier filter) dropped for unknown types.
  const unknownTypes = new Set<string>();
  const qualifies = (name: string, tier: ShinyTier | null) => {
    if (!inSel(tier)) return false;
    if (!typeSel) return true;
    const types = pokemonTypes(name);
    if (types.length === 0) {
      unknownTypes.add(squashName(name));
      return false;
    }
    return types.some((t) => typeSel.has(t));
  };
  const flag = (name: string, tier: ShinyTier | null) =>
    (selected || typeSel) && !qualifies(name, tier) ? { outsideFilter: true as const } : {};
  const keptReal: StoredHunt[] = [];
  const keptLegacy: StoredShinyLegacy[] = [];
  const playerId = filter.player ? Number(filter.player) : undefined;
  // Same rule as aggregation/rares.ts: with a player filter only that player's
  // own enemy rows count, since a party export lists each kill under whoever got it.
  const ownRow = (row: StoredHunt['enemies_defeated'][number]) => playerId === undefined || row.player_id === playerId;
  const toRow = (row: StoredHunt['enemies_defeated'][number]): EnemyRow => ({
    enemy: row.enemy,
    count: row.count,
    rare: row.rare === 1,
  });

  const included = hunts
    .filter((h) => typeof h.shiny_target === 'string' && h.shiny_target.trim() !== '')
    .filter(buildFilterPredicate<StoredHunt>(filter));

  const includedLegacy = filterLegacy(legacy, filter);

  // Keyed by squashName so the roulette's "Shiny Mr.Mime" and the game's
  // "Shiny Mr. Mime" are one row.
  const pokemon = new Map<string, PokemonAcc>();
  const tiers = new Map<ShinyTier | null, TierAcc>();
  const huntList: ShinyHuntRow[] = [];
  let totalShinies = 0;
  let targetKills = 0;
  let targetShinies = 0;
  let timedTargetShinies = 0;

  const pokemonRow = (c: Charge): PokemonAcc => {
    const key = squashName(c.name);
    let row = pokemon.get(key);
    if (!row) {
      row = {
        name: c.name,
        tier: c.tier,
        removed: c.removed,
        hunts: 0,
        kills: 0,
        shinies: 0,
        killsPerShiny: null,
        targetHunts: 0,
        targetShinies: 0,
        targetDurationSeconds: 0,
        shiniesPerHour: null,
        huntIds: new Set(),
        timedShinies: 0,
        fromExport: c.fromExport,
      };
      pokemon.set(key, row);
    } else if (c.fromExport && !row.fromExport) {
      // The game's spelling and catalog data win over the hand-typed ones.
      row.name = c.name;
      row.tier = c.tier;
      row.removed = c.removed;
      row.fromExport = true;
    }
    return row;
  };
  const tierAcc = (tier: ShinyTier | null): TierAcc => {
    let acc = tiers.get(tier);
    if (!acc) {
      acc = { huntIds: new Set(), withShinies: new Set(), chargedKills: new Set(), kills: 0, shinies: 0 };
      tiers.set(tier, acc);
    }
    return acc;
  };

  const charge = (scope: string, c: Charge) => {
    const row = pokemonRow(c);
    row.huntIds.add(scope);
    row.kills += c.kills;
    row.shinies += c.count;
    if (c.isTarget) {
      row.targetHunts += 1;
      row.targetShinies += c.count;
      row.targetDurationSeconds += c.durationSeconds;
      if (c.durationSeconds > 0) row.timedShinies += c.count;
    }

    const tier = tierAcc(c.tier);
    tier.huntIds.add(scope);
    tier.shinies += c.count;
    if (c.count > 0) tier.withShinies.add(squashName(c.name));
    const chargeKey = `${scope}|${c.speciesKey}`;
    if (!tier.chargedKills.has(chargeKey)) {
      tier.chargedKills.add(chargeKey);
      tier.kills += c.kills;
    }
  };

  for (const hunt of included) {
    const target = hunt.shiny_target!.trim();
    const allRows = hunt.enemies_defeated.map(toRow);
    const rows = hunt.enemies_defeated.filter(ownRow).map(toRow);
    // Labels come from the whole session: the filtered player may not have
    // killed the target species at all, but the target still has a name.
    const label =
      detectShinyHunt(allRows, target).candidates.find((c) => c.species === target)?.label ?? labelFromKey(target);
    const detection = detectShinyHunt(rows, target);
    const kills = (species: string | null) => (species ? detection.killsBySpecies[species] ?? 0 : 0);

    const finds = detection.finds.filter((f) => f.count > 0);
    const targetFinds = finds.filter((f) => f.isTarget);
    const huntTargetShinies = sum(targetFinds, (f) => f.count);
    const targetName = targetFinds[0]?.name ?? `Shiny ${label}`;
    const targetInfo = tierOf(targetName);

    // A target with no finds still counts: that hunt is the denominator of its average.
    const rowsToCharge: { name: string; tier: ShinyTier | null; removed: boolean; species: string | null; count: number; isTarget: boolean }[] =
      finds.map((f) => ({ name: f.name, tier: f.tier, removed: f.removed, species: f.species, count: f.count, isTarget: f.isTarget }));
    if (targetFinds.length === 0) {
      rowsToCharge.unshift({
        name: targetName,
        tier: targetInfo.tier,
        removed: targetInfo.removed,
        species: target,
        count: 0,
        isTarget: true,
      });
    }

    // Kept when something of it is in a selected tier (see the header comment).
    if (!rowsToCharge.some((item) => qualifies(item.name, item.tier))) continue;
    keptReal.push(hunt);
    const targetSelected = qualifies(targetName, targetInfo.tier);

    for (const item of rowsToCharge) {
      if (!qualifies(item.name, item.tier)) continue;
      charge(`h:${hunt.id}`, {
        name: item.name,
        tier: item.tier,
        removed: item.removed,
        speciesKey: item.species ?? item.name,
        count: item.count,
        isTarget: item.isTarget,
        kills: kills(item.species),
        durationSeconds: hunt.duration_seconds,
        fromExport: true,
      });
    }

    totalShinies += sum(finds.filter((f) => qualifies(f.name, f.tier)), (f) => f.count);
    if (targetSelected) {
      targetShinies += huntTargetShinies;
      if (hunt.duration_seconds > 0) timedTargetShinies += huntTargetShinies;
      targetKills += kills(target);
    }

    const huntFinds: ShinyHuntFind[] = finds.map((f) => ({
      name: f.name,
      count: f.count,
      tier: f.tier,
      isTarget: f.isTarget,
      isTargetCompanion: f.isTargetCompanion,
      ...flag(f.name, f.tier),
    }));
    huntList.push({
      id: hunt.id,
      legacy: false,
      huntName: hunt.hunt_name,
      startTime: hunt.start_time,
      durationSeconds: hunt.duration_seconds,
      sessionKills: hunt.kills,
      players: hunt.players.map((p) => p.name),
      targetName,
      targetTier: targetInfo.tier,
      targetShinies: huntTargetShinies,
      finds: huntFinds,
    });
  }

  for (const record of includedLegacy) {
    const scope = `l:${record.id}`;
    // The game's spelling ("Mr. Mime"), which the sprite lookup depends on.
    const targetName = gameSpelling(record.pokemon);
    const targetInfo = tierOf(targetName);
    const targetTier = record.tier ?? targetInfo.tier;
    const companionRaw = record.companion?.trim();
    const companionTier = companionRaw ? tierOf(gameSpelling(companionRaw)).tier : null;
    const companionName0 = companionRaw ? gameSpelling(companionRaw) : null;
    const companionOk = companionName0 !== null && qualifies(companionName0, companionTier);
    if (!qualifies(targetName, targetTier) && !companionOk) continue;
    keptLegacy.push(record);
    const targetSelected = qualifies(targetName, targetTier);


    if (targetSelected) {
      charge(scope, {
        name: targetName,
        tier: targetTier,
        removed: targetInfo.removed,
        speciesKey: identity(targetName).key,
        count: record.shinies,
        isTarget: true,
        kills: record.kills,
        durationSeconds: record.duration_seconds,
        fromExport: false,
      });
    }
    const huntFinds: ShinyHuntFind[] = [
      { name: targetName, count: record.shinies, tier: targetTier, isTarget: true, isTargetCompanion: false, ...flag(targetName, targetTier) },
    ];

    let companionShinies = 0;
    if (companionRaw) {
      const companionName = gameSpelling(companionRaw);
      const companionInfo = tierOf(companionName);
      companionShinies = record.companion_shinies;
      // Same spawn as the target, so it shares the record's kills (a companion
      // with 0 shinies still gets its row and hunt count).
      if (qualifies(companionName, companionInfo.tier)) {
        charge(scope, {
          name: companionName,
          tier: companionInfo.tier,
          removed: companionInfo.removed,
          speciesKey: identity(companionName).key,
          count: companionShinies,
          isTarget: false,
          kills: record.kills,
          durationSeconds: record.duration_seconds,
          fromExport: false,
        });
      }
      huntFinds.push({
        name: companionName,
        count: companionShinies,
        tier: companionInfo.tier,
        isTarget: false,
        isTargetCompanion: true,
        ...flag(companionName, companionInfo.tier),
      });
    }

    totalShinies += (targetSelected ? record.shinies : 0) + (companionOk ? companionShinies : 0);
    if (targetSelected) {
      targetShinies += record.shinies;
      if (record.duration_seconds > 0) timedTargetShinies += record.shinies;
      targetKills += record.kills;
    }

    huntList.push({
      id: record.id,
      legacy: true,
      huntName: null,
      startTime: record.start_time,
      durationSeconds: record.duration_seconds,
      sessionKills: record.kills,
      players: record.player_name ? [record.player_name] : [],
      targetName,
      targetTier,
      targetShinies: record.shinies,
      // Like real hunts, only what dropped is listed.
      finds: huntFinds.filter((f) => f.count > 0),
    });
  }

  const pokemonRows: ShinyPokemonRow[] = [...pokemon.values()]
    .map(({ huntIds, timedShinies, fromExport: _fromExport, ...row }) => ({
      ...row,
      hunts: huntIds.size,
      killsPerShiny: ratio(row.kills, row.shinies),
      shiniesPerHour: ratio(timedShinies * 3600, row.targetDurationSeconds),
    }))
    .sort((a, b) => b.shinies - a.shinies || compareText(a.name, b.name));

  const tierOrder: (ShinyTier | null)[] = [...SHINY_TIERS, null];
  const tierRows: ShinyTierRow[] = tierOrder
    .filter((tier) => tiers.has(tier))
    .map((tier) => {
      const acc = tiers.get(tier)!;
      return {
        tier,
        pokemon: acc.withShinies.size,
        hunts: acc.huntIds.size,
        kills: acc.kills,
        shinies: acc.shinies,
        killsPerShiny: ratio(acc.kills, acc.shinies),
      };
    });

  const durationSeconds = sum(keptReal, (h) => h.duration_seconds) + sum(keptLegacy, (r) => r.duration_seconds);
  return {
    hunts: keptReal.length + keptLegacy.length,
    shinies: totalShinies,
    sessionKills: sum(keptReal, (h) => h.kills) + sum(keptLegacy, (r) => r.kills),
    durationSeconds,
    killsPerShiny: ratio(targetKills, targetShinies),
    shiniesPerHour: ratio(timedTargetShinies * 3600, durationSeconds),
    pokemon: pokemonRows,
    tiers: tierRows,
    ...(typeSel ? { unknownTypePokemon: unknownTypes.size } : {}),
    // Legacy and real ids overlap, so ties on time break by kind before id.
    huntList: huntList.sort(
      (a, b) =>
        (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0) ||
        Number(a.legacy) - Number(b.legacy) ||
        b.id - a.id
    ),
  };
}
