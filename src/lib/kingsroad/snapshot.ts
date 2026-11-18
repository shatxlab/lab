import { readSave, recordWin, writeSave, type KingsroadSave } from "./meta";
import { FOES, MAX_LEVEL, START_LIVES, starsFor, TOWER_KINDS } from "./sim/balance";
import { MAPS } from "./sim/maps";
import type { Game } from "./sim/types";

/** Separate from campaign stars. Bump the envelope version if simulation state becomes incompatible. */
export const RUN_STORAGE_KEY = "lab:kingsroad:run:v1";
export const RUN_VERSION = 1;
export const CHECKPOINT_MS = 5000;

export interface RunStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageOrUndefined(): RunStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const whole = (value: unknown): value is number => number(value) && Number.isSafeInteger(value) && value >= 0;
const fields = (value: ObjectValue, keys: string[]) => keys.every((key) => number(value[key]));
const list = (value: unknown): value is ObjectValue[] => Array.isArray(value) && value.length <= 20_000 && value.every(object);

/** Validate nested state, indices and enums before either the sim or renderer can use a checkpoint.
 * Finished checkpoints are also accepted: they journal a result until campaign stars are safely written.
 */
export function normalizeRun(raw: unknown): Game | null {
  if (!object(raw) || raw.version !== RUN_VERSION || !object(raw.game)) return null;
  const game = raw.game;
  const map = MAPS.find((entry) => entry.id === game.map);
  if (!map || !["ready", "playing", "won", "lost"].includes(game.status as string)) return null;
  if (!whole(game.seed) || !Number.isSafeInteger(game.rng)) return null; // mulberry32's state is signed.
  if (!whole(game.wave) || game.wave > map.waves || !number(game.waveTime) || game.waveTime < 0) return null;
  if (game.nextWaveIn !== null && !number(game.nextWaveIn)) return null;
  if (!whole(game.lives) || game.lives > START_LIVES || !number(game.gold) || game.gold < 0) return null;
  if (!number(game.volleyLeft) || !whole(game.kills) || !whole(game.nextId) || game.nextId < 1) return null;
  if (![game.towers, game.foes, game.shots, game.volleys, game.effects, game.spawns].every(list)) return null;
  const towers = game.towers as ObjectValue[], foes = game.foes as ObjectValue[], shots = game.shots as ObjectValue[];
  const volleys = game.volleys as ObjectValue[], effects = game.effects as ObjectValue[], spawns = game.spawns as ObjectValue[];
  const ids = new Set<number>();
  const id = (value: unknown): boolean => {
    if (!whole(value) || value < 1 || value >= (game.nextId as number) || ids.has(value)) return false;
    ids.add(value);
    return true;
  };
  const road = (value: unknown) => whole(value) && value < map.roads.length;
  const kind = (value: unknown) => typeof value === "string" && Object.hasOwn(FOES, value);
  const towerKind = (value: unknown) => TOWER_KINDS.includes(value as typeof TOWER_KINDS[number]);
  const plots = new Set<number>();
  for (const tower of towers) {
    if (!id(tower.id) || !towerKind(tower.kind) || !whole(tower.plot) || tower.plot >= map.plots.length || plots.has(tower.plot)) return null;
    plots.add(tower.plot);
    if (!whole(tower.level) || tower.level < 1 || tower.level > MAX_LEVEL || !fields(tower, ["aim", "reloadLeft", "sinceShot", "spent"])) return null;
    const fork = map.archerBranches && tower.kind === "archer" && tower.level === MAX_LEVEL;
    if (fork ? !["fire", "lune"].includes(tower.branch as string) : tower.branch !== undefined) return null;
  }
  for (const foe of foes) {
    if (!id(foe.id) || !kind(foe.kind) || !fields(foe, ["x", "y", "radius", "speed", "hp", "maxHp", "slowLeft", "burnLeft", "flash", "phase", "distance", "lane", "facing", "slow", "summonTimer", "markLeft"])) return null;
    if ((foe.radius as number) <= 0 || (foe.maxHp as number) <= 0 || typeof foe.flying !== "boolean" || !object(foe.route)) return null;
    if (foe.flying !== FOES[foe.kind as keyof typeof FOES].flying || (foe.color !== undefined && typeof foe.color !== "string")) return null;
    if (foe.flying) {
      if (!object(foe.route.air) || !number(foe.route.air.fromX) || foe.route.road !== undefined) return null;
    } else if (!road(foe.route.road) || foe.route.air !== undefined) return null;
  }
  for (const shot of shots) {
    if (!id(shot.id) || !towerKind(shot.kind) || !fields(shot, ["x", "y", "fromX", "fromY", "toX", "toY", "t", "duration", "life", "damage", "splash", "slow", "burn", "mark"])) return null;
    if (!whole(shot.targetId) || typeof shot.air !== "boolean" || !Array.isArray(shot.hitIds) || shot.hitIds.length > 20_000 || !shot.hitIds.every(whole)) return null;
    if (shot.kind === "catapult" && (shot.duration as number) <= 0) return null;
  }
  for (const volley of volleys) {
    if (!id(volley.id) || !fields(volley, ["fromX", "fromY", "toX", "toY", "t", "duration", "damage"]) || (volley.duration as number) <= 0) return null;
  }
  for (const effect of effects) {
    if (!["puff", "pop", "mark"].includes(effect.kind as string) || !fields(effect, ["x", "y", "radius", "life", "duration"]) || (effect.duration as number) <= 0 || typeof effect.color !== "string") return null;
  }
  let previous = -Infinity;
  for (const spawn of spawns) {
    if (!kind(spawn.kind) || !number(spawn.at) || spawn.at < previous || !road(spawn.road)) return null;
    previous = spawn.at;
  }
  if (game.status === "ready" ? game.wave !== 0 || foes.length > 0 || spawns.length > 0 : game.wave === 0 && game.status !== "lost") return null;
  if (game.status !== "lost" && game.lives === 0) return null;
  if (game.status === "won" && (game.wave !== map.waves || foes.length > 0 || spawns.length > 0)) return null;
  return game as unknown as Game;
}

/** Returns an exact checkpoint, with no elapsed-wall-time advancement. Invalid saves never affect campaign stars. */
export function readRun(storage: RunStorage | undefined = storageOrUndefined()): Game | null {
  try {
    const raw = storage?.getItem(RUN_STORAGE_KEY);
    if (!raw) return null;
    const game = raw.length <= 5_000_000 ? normalizeRun(JSON.parse(raw)) : null;
    if (!game) clearRun(storage);
    return game;
  } catch {
    clearRun(storage);
    return null;
  }
}

export function writeRun(game: Game, storage: RunStorage | undefined = storageOrUndefined()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(RUN_STORAGE_KEY, JSON.stringify({ version: RUN_VERSION, game }));
    return true;
  } catch {
    return false;
  }
}

export function clearRun(storage: RunStorage | undefined = storageOrUndefined()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(RUN_STORAGE_KEY);
    return true;
  } catch {
    try {
      // Some storage adapters can overwrite but cannot delete; never leave a resumable stale run.
      storage.setItem(RUN_STORAGE_KEY, "null");
      return true;
    } catch {
      return false;
    }
  }
}

/** Journal the outcome, write idempotent best-stars, then remove the checkpoint.
 * A crash after either write can replay settlement, never add rewards or lower an existing best.
 * If campaign storage fails, keep the terminal journal for retry on the next load.
 */
export function settleRun(game: Game, storage: RunStorage | undefined = storageOrUndefined()): { save: KingsroadSave; newBest: boolean; persisted: boolean } {
  const before = readSave(storage);
  if (game.status !== "won" && game.status !== "lost") return { save: before, newBest: false, persisted: false };
  const journaled = writeRun(game, storage);
  const stars = game.status === "won" ? starsFor(game.lives) : 0;
  const save = stars > 0 ? recordWin(before, game.map, stars) : before;
  const progressSaved = stars === 0 || writeSave(save, storage);
  const cleared = progressSaved && clearRun(storage);
  return { save, newBest: stars > before.stars[game.map], persisted: progressSaved && (cleared || journaled) };
}
