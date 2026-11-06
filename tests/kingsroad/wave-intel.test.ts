import { describe, expect, it } from "vitest";

import { KINGSROAD_TEXT } from "@/lib/kingsroad/i18n";
import { combatDetails, foeDetails, guideKinds, upcomingWave, waveIntel } from "@/lib/kingsroad/wave-intel";
import { ARMOR_FLOOR, BOSS_SUMMON, BURN, FIREPROOF_HIT, FOES, FROST_SECONDS, HEAL_RANGE, MARK, TOWERS, TOWER_KINDS } from "@/lib/kingsroad/sim/balance";
import { callWave, castVolley, createGame, step, STEP } from "@/lib/kingsroad/sim/game";
import { MAPS, mapById } from "@/lib/kingsroad/sim/maps";
import { buildSpawns } from "@/lib/kingsroad/sim/waves";
import type { FoeKind } from "@/lib/kingsroad/sim/types";

const kinds = Object.keys(FOES) as FoeKind[];

describe("KingsRoad wave intelligence", () => {
  for (const map of MAPS) {
    it(`matches every actual scheduled spawn on ${map.id}, across four seeds`, () => {
      for (let wave = 1; wave <= map.waves; wave += 1) {
        const preview = waveIntel(wave, map)!;
        for (const seed of [1, 7, 42, 915]) {
          const spawns = buildSpawns(wave, map, { rng: seed });
          const counts = Object.fromEntries(kinds.map((kind) => [kind, spawns.filter((spawn) => spawn.kind === kind).length]));
          expect(preview.total).toBe(spawns.length);
          expect(preview.entries).toEqual(kinds.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, count: counts[kind] })));
        }
      }
    });

    it(`limits the enemy guide to the actual threats scheduled on ${map.id}`, () => {
      const scheduled = new Set<FoeKind>();
      for (let wave = 1; wave <= map.waves; wave += 1) for (const spawn of buildSpawns(wave, map, { rng: wave })) scheduled.add(spawn.kind);
      expect(guideKinds(map)).toEqual(kinds.filter((kind) => scheduled.has(kind)));
    });
  }

  it("previews wave one during setup, then the upcoming wave rather than pending current spawns", () => {
    const game = createGame("watch", 99);
    expect(upcomingWave(game)).toEqual(waveIntel(1, mapById(game.map)));
    callWave(game);
    expect(game.spawns.length).toBeGreaterThan(0);
    expect(upcomingWave(game)?.wave).toBe(2);
    game.spawns = [];
    game.nextWaveIn = 8;
    expect(upcomingWave(game)?.wave).toBe(2);
    callWave(game);
    expect(upcomingWave(game)?.wave).toBe(3);
  });

  it("includes regular and final warlords but never invents another wave after the final one", () => {
    const map = mapById("watch");
    expect(waveIntel(10, map)?.entries).toContainEqual({ kind: "boss", count: 1 });
    expect(waveIntel(map.waves, map)?.entries).toContainEqual({ kind: "boss", count: 1 });
    const game = { ...createGame("watch", 1), status: "playing" as const, wave: map.waves };
    expect(upcomingWave(game)).toBeNull();
    expect(upcomingWave({ ...game, status: "won" })).toBeNull();
    expect(upcomingWave({ ...game, status: "lost", wave: 3 })).toBeNull();
  });

  it.each([-1, 0, 1.5, Infinity, NaN, 29])("rejects out-of-map wave %s", (wave) => {
    expect(waveIntel(wave, mapById("watch"))).toBeNull();
  });

  it("does not mutate state or RNG, or change subsequent spawn/volley simulation", () => {
    const inspected = createGame("watch", 912), untouched = createGame("watch", 912);
    for (let wave = 1; wave < 5; wave += 1) {
      for (let view = 0; view < 100; view += 1) {
        upcomingWave(inspected);
        guideKinds(mapById(inspected.map));
        for (const text of Object.values(KINGSROAD_TEXT)) { for (const kind of kinds) foeDetails(kind, text); combatDetails(text); }
      }
      expect(inspected).toEqual(untouched);
      callWave(inspected); callWave(untouched);
      castVolley(inspected, 150, 120); castVolley(untouched, 150, 120);
      for (let tick = 0; tick < 120; tick += 1) { step(inspected, STEP); step(untouched, STEP); }
      expect(inspected).toEqual(untouched);
      inspected.spawns = []; untouched.spawns = [];
      inspected.nextWaveIn = 3; untouched.nextWaveIn = 3;
    }
  });

  it.each(["en", "ru"] as const)("derives every foe's numeric traits from combat configuration in %s", (lang) => {
    const text = KINGSROAD_TEXT[lang];
    for (const kind of kinds) {
      const def = FOES[kind], details = foeDetails(kind, text);
      expect(text.foes[kind].name.length).toBeGreaterThan(0);
      expect(details).toContain(text.foes[kind].description);
      expect(details).toContain(text.foeLeak(def.leak));
      expect(details.includes(text.flyingFoe)).toBe(def.flying);
      expect(details.includes(text.armorRule(def.armor, ARMOR_FLOOR))).toBe(def.armor > 0);
      expect(details.includes(text.fireproofRule(FIREPROOF_HIT))).toBe(def.fireproof);
      expect(details.includes(text.healerRule(def.heal, HEAL_RANGE))).toBe(def.heal > 0);
      expect(details.includes(text.summonRule(BOSS_SUMMON.count, BOSS_SUMMON.every))).toBe(kind === "boss");
    }
    const air = TOWER_KINDS.filter((kind) => TOWERS[kind].air).map((kind) => text.towers[kind].name).join(", ");
    const ground = TOWER_KINDS.filter((kind) => !TOWERS[kind].air).map((kind) => text.towers[kind].name).join(", ");
    expect(combatDetails(text)).toEqual([
      text.airTargetRule(air, ground), text.targetingRule, text.frostRule(FROST_SECONDS),
      text.burnRule(BURN.dps, BURN.seconds), text.markRule(MARK.bonus, MARK.seconds),
    ]);
  });
});
