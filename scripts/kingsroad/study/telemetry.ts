/** Study-only observers. No fields, hooks, RNG calls, or telemetry are added to the shipping game. */
import type { Foe, Game, Shot, Tower, TowerKind, VolleyArrow } from "../../../src/lib/kingsroad/sim/types";
import { MARK } from "../../../src/lib/kingsroad/sim/balance";

export type Source = TowerKind | "archer-fire" | "archer-lune" | "volley";
export interface Damage {
  fired: number; retired: number; pending: number; missed: number; hits: number;
  nominal: number; armorLost: number; fireproofLost: number; applied: number;
  pierceUseful: number; beyondThirdUseful: number; usefulByFoe: Record<string, number>;
  useful: number; overkill: number; burnUseful: number; markUsefulShare: number;
  activeSeconds: number; targetSeconds: number; readyNoTargetSeconds: number;
  hitHistogram: Record<string, number>;
}
export const emptyDamage = (): Damage => ({ fired: 0, retired: 0, pending: 0, missed: 0, hits: 0, nominal: 0, armorLost: 0, fireproofLost: 0, applied: 0, pierceUseful: 0, beyondThirdUseful: 0, usefulByFoe: {}, useful: 0, overkill: 0, burnUseful: 0, markUsefulShare: 0, activeSeconds: 0, targetSeconds: 0, readyNoTargetSeconds: 0, hitHistogram: {} });
interface Projectile { source: Source; tower: number; hits: number }
export interface Audit {
  time: number; bySource: Partial<Record<Source, Damage>>; byTower: Record<number, Damage>;
  projectiles: Map<number, Projectile>; burnOwners: Map<number, Projectile>;
  spawnedHp: number; healed: number; useful: number; leakedHp: number;
  spawned: Record<string, number>; leaks: Record<string, number>; kills: Record<string, number>;
  volleyCasts: number; lastUsefulVolley: number | null; slowEquivalentSeconds: number;
}
const audits = new WeakMap<Game, Audit>();
export function beginAudit(game: Game): Audit {
  const audit: Audit = { time: 0, bySource: {}, byTower: {}, projectiles: new Map(), burnOwners: new Map(), spawnedHp: 0, healed: 0, useful: 0, leakedHp: 0, spawned: {}, leaks: {}, kills: {}, volleyCasts: 0, lastUsefulVolley: null, slowEquivalentSeconds: 0 };
  audits.set(game, audit);
  return audit;
}
function sourceOf(tower: Tower): Source { return tower.kind === "archer" && tower.branch ? `archer-${tower.branch}` : tower.kind; }
function buckets(a: Audit, p: Projectile): Damage[] {
  const source = a.bySource[p.source] ??= emptyDamage();
  return p.tower ? [source, a.byTower[p.tower] ??= emptyDamage()] : [source];
}
export function observeShot(game: Game, tower: Tower, shot: Shot) {
  const a = audits.get(game); if (!a) return;
  const p = { source: sourceOf(tower), tower: tower.id, hits: 0 };
  a.projectiles.set(shot.id, p);
  for (const b of buckets(a, p)) { b.fired++; b.pending++; }
}
export function observeCast(game: Game, arrows: VolleyArrow[]) {
  const a = audits.get(game); if (!a) return;
  a.volleyCasts++;
  for (const arrow of arrows) {
    const p: Projectile = { source: "volley", tower: 0, hits: 0 };
    a.projectiles.set(arrow.id, p);
    for (const b of buckets(a, p)) { b.fired++; b.pending++; }
  }
}
export function observeHit(game: Game, source: { id: number }, foe: Foe, nominal: number, raw: number, armored: number, applied: number) {
  const a = audits.get(game); if (!a) return;
  const p = a.projectiles.get(source.id); if (!p) throw new Error(`Unregistered study projectile ${source.id}`);
  p.hits++;
  const useful = Math.min(Math.max(0, foe.hp), applied);
  a.useful += useful;
  if (p.source === "volley" && useful > 0) a.lastUsefulVolley = a.time;
  for (const b of buckets(a, p)) {
    b.hits++; b.nominal += nominal; b.fireproofLost += nominal - raw;
    b.armorLost += raw - armored; b.applied += applied; b.useful += useful;
    b.usefulByFoe[foe.kind] = (b.usefulByFoe[foe.kind] ?? 0) + useful;
    if (p.source === "ballista" && p.hits > 1) b.pierceUseful += useful;
    if (p.source === "ballista" && p.hits > 3) b.beyondThirdUseful += useful;
    b.overkill += applied - useful;
    if (foe.markLeft > 0) b.markUsefulShare += useful * MARK.bonus / (1 + MARK.bonus);
  }
}
export function observeBurnOwner(game: Game, foe: Foe, shot: Shot) {
  const a = audits.get(game); if (!a) return;
  const p = a.projectiles.get(shot.id); if (p) a.burnOwners.set(foe.id, p);
}
export function observeBurn(game: Game, foe: Foe, applied: number) {
  const a = audits.get(game); if (!a) return;
  const p = a.burnOwners.get(foe.id); if (!p) throw new Error("Missing burn owner");
  const useful = Math.min(Math.max(0, foe.hp), applied);
  a.useful += useful;
  for (const b of buckets(a, p)) {
    b.usefulByFoe[foe.kind] = (b.usefulByFoe[foe.kind] ?? 0) + useful;
    b.applied += applied; b.useful += useful; b.burnUseful += useful; b.overkill += applied - useful;
    if (foe.markLeft > 0) b.markUsefulShare += useful * MARK.bonus / (1 + MARK.bonus);
  }
}
export function observeRetire(game: Game, id: number) {
  const a = audits.get(game); if (!a) return;
  const p = a.projectiles.get(id); if (!p) throw new Error(`Missing retiring projectile ${id}`);
  for (const b of buckets(a, p)) {
    b.retired++; b.pending--; if (!p.hits) b.missed++;
    b.hitHistogram[p.hits] = (b.hitHistogram[p.hits] ?? 0) + 1;
  }
  a.projectiles.delete(id);
}
export function observeSpawn(game: Game, foe: Foe) {
  const a = audits.get(game); if (!a) return;
  a.spawnedHp += foe.hp; a.spawned[foe.kind] = (a.spawned[foe.kind] ?? 0) + 1;
}
export function observeHeal(game: Game, amount: number) { const a = audits.get(game); if (a) a.healed += amount; }
export function observeLeak(game: Game, foe: Foe) {
  const a = audits.get(game); if (!a) return;
  a.leakedHp += Math.max(0, foe.hp); a.leaks[foe.kind] = (a.leaks[foe.kind] ?? 0) + 1;
  a.burnOwners.delete(foe.id);
}
export function observeKill(game: Game, foe: Foe) {
  const a = audits.get(game); if (!a) return;
  a.kills[foe.kind] = (a.kills[foe.kind] ?? 0) + 1; a.burnOwners.delete(foe.id);
}
export function observeCoverage(game: Game, tower: Tower, target: boolean, dt: number) {
  const a = audits.get(game); if (!a) return;
  const p = { source: sourceOf(tower), tower: tower.id, hits: 0 };
  for (const b of buckets(a, p)) { b.activeSeconds += dt; if (target) b.targetSeconds += dt; else if (tower.reloadLeft === 0) b.readyNoTargetSeconds += dt; }
}
export function observeSlow(game: Game, amount: number) { const a = audits.get(game); if (a) a.slowEquivalentSeconds += amount; }

export function finishAudit(game: Game, a: Audit) {
  const livingHp = game.foes.reduce((sum, f) => sum + Math.max(0, f.hp), 0);
  const ledgerError = a.spawnedHp + a.healed - a.useful - a.leakedHp - livingHp;
  if (Math.abs(ledgerError) > Math.max(0.0001, a.spawnedHp * 1e-8)) throw new Error(`HP ledger does not reconcile: ${ledgerError}`);
  return { bySource: a.bySource, byTower: a.byTower, spawnedHp: a.spawnedHp, healed: a.healed, useful: a.useful, leakedHp: a.leakedHp, livingHp, ledgerError,
    spawned: a.spawned, leaks: a.leaks, kills: a.kills, volleyCasts: a.volleyCasts, lastUsefulVolley: a.lastUsefulVolley, slowEquivalentSeconds: a.slowEquivalentSeconds };
}
