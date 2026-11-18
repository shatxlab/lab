import { bankRun, readSaveState, validRunId, writeSave, type TowerSave, type TowerStorage } from "./meta";
import { ENEMIES, MAX_CALTROPS, PERK_IDS, PERKS, SKILLS, UPGRADE_IDS, UPGRADE_MAX } from "./sim/balance";
import { towerStats } from "./sim/stats";
import { waveRoster } from "./sim/waves";
import type { PerkLevels, Run, UpgradeLevels } from "./sim/types";

/** Separate from permanent gold/perks. The key stays stable; v1 envelopes migrate explicitly on read. */
export const RUN_STORAGE_KEY = "lab:tower:run:v1";
export const RUN_VERSION = 2;
export const CHECKPOINT_MS = 5000;
const MAX_ITEMS = 20_000;

export interface RunStorage extends TowerStorage {
  removeItem(key: string): void;
}

export interface RunCheckpoint {
  version: typeof RUN_VERSION;
  id: string;
  run: Run;
}

function storageOrUndefined(): RunStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

let fallbackId = 0;
export function createCheckpoint(run: Run): RunCheckpoint {
  const id = globalThis.crypto?.randomUUID?.() ?? `tower-${Date.now().toString(36)}-${++fallbackId}-${Math.random().toString(36).slice(2)}`;
  return { version: RUN_VERSION, id, run };
}

type Obj = Record<string, unknown>;
const object = (value: unknown): value is Obj => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const whole = (value: unknown): value is number => number(value) && Number.isSafeInteger(value) && value >= 0;
const fields = (value: Obj, keys: string[]) => keys.every((key) => number(value[key]));
const list = (value: unknown): value is Obj[] => Array.isArray(value) && value.length <= MAX_ITEMS && value.every(object);
const kind = (value: unknown) => typeof value === "string" && Object.hasOwn(ENEMIES, value);

/** Preserve old gold/identity/combat while replacing volley mechanics with the default Catapult. */
function migrateCheckpoint(raw: Obj): Obj {
  if (raw.version !== 1 || !object(raw.run)) return raw;
  const old = raw.run;
  const oldUpgrades = object(old.upgrades) ? old.upgrades : {};
  const upgrades: Obj = {
    ...oldUpgrades,
    skillSize: oldUpgrades.volleySize,
    skillCooldown: oldUpgrades.volleyCooldown,
  };
  delete upgrades.volleySize;
  delete upgrades.volleyCooldown;
  const enemies = Array.isArray(old.enemies)
    ? old.enemies.map((enemy) => object(enemy) ? { freezeLeft: 0, ...enemy } : enemy)
    : old.enemies;
  const run: Obj = {
    ...old,
    upgrades,
    enemies,
    skill: "catapult",
    skillLeft: old.volleyLeft,
    skillCasts: [],
  };
  delete run.volleyLeft;
  return { ...raw, version: RUN_VERSION, run };
}

/** Validate the entire run before the renderer/sim uses it. Terminal runs are recoverable reward journals. */
export function normalizeRun(raw: unknown): RunCheckpoint | null {
  if (!object(raw)) return null;
  const migrated = migrateCheckpoint(raw);
  if (migrated.version !== RUN_VERSION || !validRunId(migrated.id) || !object(migrated.run)) return null;
  const run = migrated.run;
  if (!["playing", "choosing", "over"].includes(run.phase as string)) return null;
  if (!whole(run.seed) || !Number.isSafeInteger(run.rng) || !whole(run.wave)) return null;
  // Bound allocations when a restored picker starts its next wave, not just the stored arrays.
  if (Object.values(waveRoster(run.wave + 1)).reduce((sum, count) => sum + count, 0) > MAX_ITEMS) return null;
  if (!whole(run.picksLeft) || run.picksLeft > PERKS.headStart.max || !whole(run.kills) || !whole(run.gold) || !whole(run.nextId) || run.nextId < 1) return null;
  if (!Object.hasOwn(SKILLS, run.skill as string)) return null;
  if (!fields(run, ["waveTime", "hp", "reloadLeft", "skillLeft", "aim"]) || (run.waveTime as number) < 0 || (run.skillLeft as number) < 0 || typeof run.firing !== "boolean") return null;
  if (!object(run.upgrades) || !object(run.perks)) return null;
  for (const id of UPGRADE_IDS) if (!whole(run.upgrades[id]) || (run.upgrades[id] as number) > UPGRADE_MAX[id]) return null;
  for (const id of PERK_IDS) if (!whole(run.perks[id]) || (run.perks[id] as number) > PERKS[id].max) return null;
  const maxHp = towerStats(run.upgrades as UpgradeLevels, run.perks as PerkLevels).maxHp;
  if ((run.hp as number) < 0 || (run.hp as number) > maxHp || (run.hp === 0 && run.phase !== "over")) return null;
  if (!Array.isArray(run.choices) || run.choices.length > 3 || new Set(run.choices).size !== run.choices.length) return null;
  if (!run.choices.every((id: unknown) => UPGRADE_IDS.includes(id as typeof UPGRADE_IDS[number]) && (run.upgrades as UpgradeLevels)[id as keyof UpgradeLevels] < UPGRADE_MAX[id as keyof UpgradeLevels])) return null;
  if (![run.enemies, run.arrows, run.skillCasts, run.volleys, run.caltrops, run.effects, run.spawns].every(list)) return null;
  const enemies = run.enemies as Obj[], arrows = run.arrows as Obj[], skillCasts = run.skillCasts as Obj[], volleys = run.volleys as Obj[];
  const caltrops = run.caltrops as Obj[], effects = run.effects as Obj[], spawns = run.spawns as Obj[];
  if (caltrops.length > MAX_CALTROPS) return null;
  const ids = new Set<number>();
  const id = (value: unknown) => {
    if (!whole(value) || value < 1 || value >= (run.nextId as number) || ids.has(value)) return false;
    ids.add(value);
    return true;
  };
  for (const enemy of enemies) {
    if (!id(enemy.id) || !kind(enemy.kind) || !fields(enemy, ["x", "y", "targetX", "hp", "maxHp", "radius", "speed", "damage", "attackEvery", "attackTimer", "burnLeft", "burnDps", "slowLeft", "slow", "freezeLeft", "summonTimer", "flash", "phase"])) return null;
    if ((enemy.hp as number) <= 0 || (enemy.maxHp as number) <= 0 || (enemy.radius as number) <= 0 || (enemy.speed as number) < 0 || (enemy.attackEvery as number) <= 0) return null;
    if (enemy.flying !== ENEMIES[enemy.kind as keyof typeof ENEMIES].flying || (enemy.slow as number) < 0 || (enemy.slow as number) > 1) return null;
  }
  for (const arrow of arrows) {
    if (!id(arrow.id) || !fields(arrow, ["x", "y", "vx", "vy", "damage", "life"]) || typeof arrow.crit !== "boolean") return null;
    if (!whole(arrow.pierceLeft) || arrow.pierceLeft > UPGRADE_MAX.pierce || !whole(arrow.ricochetLeft) || arrow.ricochetLeft > UPGRADE_MAX.ricochet) return null;
    if (!Array.isArray(arrow.hitIds) || arrow.hitIds.length > MAX_ITEMS || !arrow.hitIds.every((value: unknown) => whole(value) && value > 0 && value < (run.nextId as number))) return null;
  }
  for (const cast of skillCasts) {
    if (!id(cast.id) || cast.skill !== run.skill || !fields(cast, ["x", "y", "t", "duration", "radius", "damage", "burnDps"])) return null;
    if ((cast.duration as number) <= 0 || (cast.t as number) < 0 || (cast.t as number) >= 1 || (cast.radius as number) <= 0 || (cast.damage as number) < 0 || (cast.burnDps as number) < 0) return null;
  }
  for (const volley of volleys) {
    if (!id(volley.id) || !fields(volley, ["fromX", "fromY", "toX", "toY", "t", "duration", "damage"]) || (volley.duration as number) <= 0 || (volley.t as number) < 0 || (volley.t as number) >= 1) return null;
  }
  for (const caltrop of caltrops) if (!id(caltrop.id) || !fields(caltrop, ["x", "y", "angle", "life"])) return null;
  for (const effect of effects) {
    if (!["puff", "pop", "mark"].includes(effect.kind as string) || !fields(effect, ["x", "y", "radius", "life", "duration"]) || (effect.duration as number) <= 0 || typeof effect.color !== "string") return null;
  }
  let previous = 0;
  for (const spawn of spawns) {
    if (!kind(spawn.kind) || !number(spawn.at) || spawn.at < previous) return null;
    previous = spawn.at;
  }
  if (run.phase === "playing" && (run.wave === 0 || run.picksLeft !== 0 || run.choices.length > 0)) return null;
  if (run.phase === "choosing" && (run.picksLeft === 0 || run.choices.length === 0 || enemies.length > 0 || spawns.length > 0)) return null;
  return migrated as unknown as RunCheckpoint;
}

/** A failed read is not corrupt data: keep the unknown checkpoint intact. */
export function readRunState(storage: RunStorage | undefined = storageOrUndefined()): { checkpoint: RunCheckpoint | null; readable: boolean } {
  let raw: string | null;
  try {
    if (!storage) return { checkpoint: null, readable: false };
    raw = storage.getItem(RUN_STORAGE_KEY);
  } catch { return { checkpoint: null, readable: false }; }
  if (!raw) return { checkpoint: null, readable: true };
  try {
    const checkpoint = raw.length <= 5_000_000 ? normalizeRun(JSON.parse(raw)) : null;
    if (!checkpoint) clearRun(storage);
    return { checkpoint, readable: true };
  } catch {
    clearRun(storage);
    return { checkpoint: null, readable: true };
  }
}

export function readRun(storage: RunStorage | undefined = storageOrUndefined()): RunCheckpoint | null {
  return readRunState(storage).checkpoint;
}

export function writeRun(checkpoint: RunCheckpoint, storage: RunStorage | undefined = storageOrUndefined()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(RUN_STORAGE_KEY, JSON.stringify(checkpoint));
    return true;
  } catch { return false; }
}

/** An expected identity prevents a delayed old result from clearing a newer active run. */
export function clearRun(storage: RunStorage | undefined = storageOrUndefined(), expectedId?: string): boolean {
  if (!storage) return false;
  if (expectedId) {
    try {
      const raw = storage.getItem(RUN_STORAGE_KEY);
      if (!raw || JSON.parse(raw)?.id !== expectedId) return true;
    } catch { return false; }
  }
  try { storage.removeItem(RUN_STORAGE_KEY); return true; } catch {
    try { storage.setItem(RUN_STORAGE_KEY, "null"); return true; } catch { return false; }
  }
}

/** The receipt and the additive gold/runs are one atomic localStorage write.
 * Journal first, bank once, clear last. Retry after either crash boundary without paying twice.
 * An unreadable meta save is not a fresh save: don't overwrite unknown rewards or receipts.
 */
export function settleRun(checkpoint: RunCheckpoint, storage: RunStorage | undefined = storageOrUndefined()): { save: TowerSave; persisted: boolean; newBest: boolean } {
  const before = readSaveState(storage);
  if (checkpoint.run.phase !== "over") return { save: before.save, persisted: false, newBest: false };
  if (!before.readable) {
    writeRun(checkpoint, storage);
    return { save: before.save, persisted: false, newBest: false };
  }
  if (before.save.settledRunIds.includes(checkpoint.id)) {
    clearRun(storage, checkpoint.id);
    return { save: before.save, persisted: true, newBest: false };
  }
  writeRun(checkpoint, storage);
  const save = { ...bankRun(before.save, checkpoint.run), settledRunIds: [...before.save.settledRunIds, checkpoint.id] };
  const paid = writeSave(save, storage);
  if (paid) clearRun(storage, checkpoint.id);
  return { save: paid ? save : before.save, persisted: paid, newBest: checkpoint.run.wave > before.save.best };
}
