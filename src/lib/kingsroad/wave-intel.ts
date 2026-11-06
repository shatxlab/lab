import type { KingsroadText } from "./i18n";
import { ARMOR_FLOOR, BOSS_SUMMON, BURN, FIREPROOF_HIT, FOES, FROST_SECONDS, HEAL_RANGE, MARK, TOWER_KINDS, TOWERS } from "./sim/balance";
import { mapById, type MapDef } from "./sim/maps";
import type { FoeKind, Game } from "./sim/types";
import { waveRoster } from "./sim/waves";

const FOE_KINDS = Object.keys(FOES) as FoeKind[];

export interface WaveIntel {
  wave: number;
  entries: { kind: FoeKind; count: number }[];
  total: number;
}

/** Composition only: never build a randomized spawn schedule or consume the live game's RNG. */
export function waveIntel(wave: number, map: MapDef): WaveIntel | null {
  if (!Number.isInteger(wave) || wave < 1 || wave > map.waves) return null;
  const roster = waveRoster(wave, map);
  const entries = FOE_KINDS.filter((kind) => roster[kind] > 0).map((kind) => ({ kind, count: roster[kind] }));
  return { wave, entries, total: entries.reduce((sum, entry) => sum + entry.count, 0) };
}

/** While a wave is still marching, preview the next one, not the remaining current spawns. */
export function upcomingWave(game: Pick<Game, "map" | "status" | "wave">): WaveIntel | null {
  if (game.status !== "ready" && game.status !== "playing") return null;
  return waveIntel(game.status === "ready" ? 1 : game.wave + 1, mapById(game.map));
}

/** Include threats from this map even if they are absent from the immediate next wave. */
export function guideKinds(map: MapDef): FoeKind[] {
  const present = new Set<FoeKind>();
  for (let wave = 1; wave <= map.waves; wave += 1) {
    const roster = waveRoster(wave, map);
    for (const kind of FOE_KINDS) if (roster[kind] > 0) present.add(kind);
  }
  return FOE_KINDS.filter((kind) => present.has(kind));
}

/** All numeric traits and air-targeting lists come from the actual combat configuration. */
export function foeDetails(kind: FoeKind, text: KingsroadText): string[] {
  const def = FOES[kind];
  return [
    text.foes[kind].description,
    ...(def.flying ? [text.flyingFoe] : []),
    ...(def.armor > 0 ? [text.armorRule(def.armor, ARMOR_FLOOR)] : []),
    ...(def.fireproof ? [text.fireproofRule(FIREPROOF_HIT)] : []),
    ...(def.heal > 0 ? [text.healerRule(def.heal, HEAL_RANGE)] : []),
    ...(kind === "boss" ? [text.summonRule(BOSS_SUMMON.count, BOSS_SUMMON.every)] : []),
    text.foeLeak(def.leak),
  ];
}

export function combatDetails(text: KingsroadText): string[] {
  const names = (air: boolean) => TOWER_KINDS.filter((kind) => TOWERS[kind].air === air).map((kind) => text.towers[kind].name).join(", ");
  return [
    text.airTargetRule(names(true), names(false)),
    text.targetingRule,
    text.frostRule(FROST_SECONDS),
    text.burnRule(BURN.dps, BURN.seconds),
    text.markRule(MARK.bonus, MARK.seconds),
  ];
}
