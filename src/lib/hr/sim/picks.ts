import { classPassives, classWeapons } from "./classes";
import { random } from "@/lib/tower/sim/random";
import {
  GOLD_PICK,
  CLASS_HEAL_SHARE,
  HEAL_SHARE,
  MAX_PASSIVE_LEVEL,
  MAX_PASSIVES,
  MAX_WEAPON_LEVEL,
  MAX_WEAPONS,
  PASSIVE_IDS,
  PICKS_OFFERED,
  WEAPON_IDS,
} from "./balance";
import { withPassives } from "./hero";
import type { Pick, Run } from "./types";

/** Everything the hero could take right now: the next level of what they have, and new things while slots are free. */
export function possiblePicks(run: Run): Pick[] {
  const picks: Pick[] = [];
  for (const id of run.classId ? classWeapons(run.classId) : WEAPON_IDS) {
    const owned = run.weapons.find((weapon) => weapon.id === id);
    if (owned ? owned.level < MAX_WEAPON_LEVEL : run.weapons.length < MAX_WEAPONS) picks.push({ kind: "weapon", id, level: (owned?.level ?? 0) + 1 });
  }
  const passives = PASSIVE_IDS.filter((id) => (run.passives[id] ?? 0) > 0).length;
  for (const id of run.classId ? classPassives(run.classId) : PASSIVE_IDS) {
    const level = run.passives[id] ?? 0;
    if (level > 0 ? level < MAX_PASSIVE_LEVEL : passives < MAX_PASSIVES) picks.push({ kind: "passive", id, level: level + 1 });
  }
  return picks;
}

/** Three picks at random (more with the corner office or a lucky find), topped up with a heal and gold once the build is nearly full. */
export function rollPicks(run: Run, lucky = 0): Pick[] {
  const pool = possiblePicks(run);
  const offer: Pick[] = [];
  const size = PICKS_OFFERED + run.extraPicks + lucky;
  const draw = (indexes: number[]) => {
    if (indexes.length > 0) offer.push(pool.splice(indexes[Math.floor(random(run) * indexes.length)], 1)[0]);
  };
  // The class's default weapon is equipped from the start, so the offer just reserves an upgrade and a new item
  // while either exists; the new slot prefers a pool weapon that isn't owned yet.
  if (run.classId) {
    const upgrades = pool.filter((pick) => "level" in pick && pick.level > 1);
    draw(pool.flatMap((pick, i) => upgrades.includes(pick) ? [i] : []));
    const fresh = pool.filter((pick) => pick.kind === "weapon" && pick.level === 1);
    const source = fresh.length > 0 ? fresh : pool.filter((pick) => "level" in pick && pick.level === 1);
    draw(pool.flatMap((pick, i) => source.includes(pick) ? [i] : []));
  }
  while (offer.length < size && pool.length > 0) draw(pool.map((_, i) => i));
  if (offer.length < size) offer.push({ kind: "heal" });
  if (offer.length < size) offer.push({ kind: "gold" });
  return offer;
}

export function applyPick(run: Run, pick: Pick): void {
  switch (pick.kind) {
    case "weapon": {
      const owned = run.weapons.find((weapon) => weapon.id === pick.id);
      if (owned) owned.level = pick.level;
      else run.weapons.push({ id: pick.id, level: 1, cooldownLeft: 0, spin: 0 });
      break;
    }
    case "passive": {
      const before = run.numbers.maxHp;
      run.passives[pick.id] = pick.level;
      run.numbers = withPassives(run.base, run.passives);
      // More max hp comes with the hp to fill it.
      run.hero.hp += Math.max(0, run.numbers.maxHp - before);
      break;
    }
    case "heal":
      run.hero.hp = Math.min(run.numbers.maxHp, run.hero.hp + run.numbers.maxHp * (run.classId ? CLASS_HEAL_SHARE : HEAL_SHARE));
      break;
    case "gold":
      run.gold += GOLD_PICK;
      break;
    case "mutation":
      // The hammer bends the weapon's pattern for the rest of the day; `fire` reads it through `weaponNumbers`.
      run.mutations = { ...run.mutations, [pick.weapon]: pick.mutation };
      break;
  }
}
