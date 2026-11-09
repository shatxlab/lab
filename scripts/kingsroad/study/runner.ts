import { createHash } from "node:crypto";
import * as observed from "./instrumented-game";
import * as original from "./variant-game";
import type { Variant } from "./variant";
import { verifyRange } from "./range-fixtures";
import { verifyPiercing } from "./piercing-fixtures";
import { FOES, TOWERS } from "../../../src/lib/kingsroad/sim/balance";
import type { FoeKind } from "../../../src/lib/kingsroad/sim/types";
import { mapById } from "../../../src/lib/kingsroad/sim/maps";
import type { Game, MapId } from "../../../src/lib/kingsroad/sim/types";
import { beginAudit, finishAudit } from "./telemetry";
import { affordableActions, affordableRebuilds, decide, newDecisions, type Decisions, type Engine, type Policy } from "./policy";

export interface Checkpoint { variant: Variant; game: Game; tick: number; decisions: Decisions }
export interface Options { map: MapId; seed: number; policy: Policy; observe?: boolean; snapshots?: boolean; phases?: boolean; frozen?: boolean; maxTicks?: number }
export interface PhaseSnapshot { time: number; wave: number; lives: number; spent: number; stateHash: string; bySource: NonNullable<ReturnType<typeof finishAudit>>["bySource"] | null }
export function play(options: Options, checkpoint?: Checkpoint) {
  if (options.observe && !observed.AUDIT_BUILD) throw new Error("Use the study builder: observers are not present in an ordinary import.");
  if (observed.STUDY_VARIANT !== original.STUDY_VARIANT) throw new Error("Observed/control variants do not match");
  if (checkpoint && checkpoint.variant !== original.STUDY_VARIANT) throw new Error("Checkpoint belongs to a different study variant");
  const sim: Engine = options.observe ? observed : original;
  const game = checkpoint ? structuredClone(checkpoint.game) : sim.createGame(options.map, options.seed);
  const d = checkpoint ? structuredClone(checkpoint.decisions) : newDecisions();
  let tick = checkpoint?.tick ?? 0;
  const audit = options.observe ? beginAudit(game) : null;
  if (audit && checkpoint) throw new Error("Checkpoint counterfactuals use the original engine, not a partial HP audit.");
  let opening: { time: number; spent: number; lives: number; bySource: NonNullable<ReturnType<typeof finishAudit>>["bySource"] } | null = null;
  let lastPurchaseCheckpoint: Checkpoint | null = null;
  const checkpoints: Checkpoint[] = [];
  const waves: { wave: number; time: number; lives: number; gold: number; spent: number; towers: number; affordable: number }[] = [];
  const phases: { firstArcherFinal: PhaseSnapshot | null; wave4: PhaseSnapshot | null; wave9: PhaseSnapshot | null } | null = options.phases ? { firstArcherFinal: null, wave4: null, wave9: null } : null;
  const phaseSnapshot = (): PhaseSnapshot => ({ time: tick * sim.STEP, wave: game.wave, lives: game.lives, spent: d.spent,
    stateHash: createHash("sha256").update(JSON.stringify(game)).digest("hex"), bySource: audit ? structuredClone(finishAudit(game, audit).bySource) : null });
  const beforeArcherFinal = () => { if (phases && !phases.firstArcherFinal) phases.firstArcherFinal = phaseSnapshot(); };
  const capture = () => {
    if (phases && game.wave === 4 && !phases.wave4) phases.wave4 = phaseSnapshot();
    if (phases && game.wave === 9 && !phases.wave9) phases.wave9 = phaseSnapshot();
    waves.push({ wave: game.wave, time: tick * sim.STEP, lives: game.lives, gold: game.gold, spent: d.spent, towers: game.towers.length, affordable: affordableActions(game, sim) });
    if (options.snapshots) checkpoints.push({ variant: original.STUDY_VARIANT, game: structuredClone(game), tick, decisions: structuredClone(d) });
  };
  if (!checkpoint) capture();
  if (game.status === "ready") {
    decide(game, options.policy, d, tick * sim.STEP, sim, options.frozen, phases ? beforeArcherFinal : undefined);
    if (options.snapshots && d.purchases.length) lastPurchaseCheckpoint = { variant: original.STUDY_VARIANT, game: structuredClone(game), tick, decisions: structuredClone(d) };
    sim.callWave(game); capture();
  }
  let lastWave = game.wave;
  while (game.status === "playing" && tick < (options.maxTicks ?? 60 * 60 * 45)) {
    tick++;
    if (audit) audit.time = tick * sim.STEP;
    sim.step(game, sim.STEP);
    if (audit && tick === 7200) opening = { time: tick * sim.STEP, spent: d.spent, lives: game.lives, bySource: structuredClone(audit.bySource) };
    if (game.wave !== lastWave) { capture(); lastWave = game.wave; }
    if (tick % 30 === 0 && game.status === "playing") {
      const before = d.purchases.length;
      decide(game, options.policy, d, tick * sim.STEP, sim, options.frozen, phases ? beforeArcherFinal : undefined);
      if (options.snapshots && d.purchases.length > before) lastPurchaseCheckpoint = { variant: original.STUDY_VARIANT, game: structuredClone(game), tick, decisions: structuredClone(d) };
      const affordable = affordableActions(game, sim);
      if (affordable) d.affordableActionSeconds += 0.5;
      else d.noDirectPurchaseSeconds += 0.5;
      if (affordable && d.purchases.length === before) d.policyBlockedSeconds += 0.5;
    }
  }
  const duration = tick * sim.STEP;
  const metrics = audit ? finishAudit(game, audit) : null;
  const goldLedgerError = game.gold - (mapById(game.map).startGold + d.earlyGold + Object.entries(metrics?.kills ?? {}).reduce((sum, [kind, count]) => sum + FOES[kind as FoeKind].gold * count, 0) - d.spent);
  if (audit && Math.abs(goldLedgerError) > 1e-8) throw new Error(`Gold ledger does not reconcile: ${goldLedgerError}`);
  const spentByKind: Record<string, number> = {};
  for (const purchase of d.purchases) spentByKind[purchase.kind] = (spentByKind[purchase.kind] ?? 0) + purchase.cost;
  return {
    ballistaRanges: TOWERS.ballista.levels.map(level => level.range), variant: original.STUDY_VARIANT, map: game.map, seed: options.seed, policy: options.policy, status: game.status === "playing" ? "timeout" : game.status,
    wave: game.wave, lives: game.lives, gold: game.gold, duration, kills: game.kills,
    spent: d.spent, spentByKind, lastPurchase: d.lastPurchase, lastPurchaseWave: d.purchases.at(-1)?.wave ?? null,
    postPurchaseSeconds: d.lastPurchase === null ? null : duration - d.lastPurchase,
    finalAffordableActions: affordableActions({ ...game, status: "playing" }, sim),
    finalRebuildChoices: affordableRebuilds({ ...game, status: "playing" }, sim),
    opening,
    phases, decisions: d, metrics, waves, goldLedgerError: audit ? goldLedgerError : null,
    towers: game.towers.map(t => ({ kind: t.kind, branch: t.branch, level: t.level, plot: t.plot, spent: t.spent })),
    stateHash: createHash("sha256").update(JSON.stringify(game)).digest("hex"),
    checkpoints, lastPurchaseCheckpoint,
  };
}
export type Result = ReturnType<typeof play>;

/** Suffix probes freeze purchases, not time; automatic waves and aiming decisions continue normally. */
export function pacingProbes(baseline: Result, options: Options) {
  if (baseline.status !== "won") return { excluded: "baseline did not win", probes: [], sustainedWave: null, sustainedTime: null, noVolley: null, afterLastPurchaseNoVolley: null, reallocation: reallocationProbes(baseline, options) };
  const probes = baseline.checkpoints.map(checkpoint => {
    const r = play({ ...options, observe: false, snapshots: false, frozen: true }, checkpoint);
    return { wave: checkpoint.game.wave, time: checkpoint.tick * original.STEP, spent: checkpoint.decisions.spent, status: r.status, lives: r.lives, gold: r.gold, duration: r.duration, equivalent: r.status === "won" && r.lives >= baseline.lives };
  });
  // Do not assume buying less is monotone: geometry, deaths and RNG can change later interactions.
  const first = probes.findIndex((p, i) => p.equivalent && probes.slice(i).every(later => later.equivalent));
  const checkpoint = first >= 0 ? baseline.checkpoints[first] : undefined;
  const noVolley = checkpoint ? play({ ...options, policy: { ...options.policy, volley: false }, observe: false, snapshots: false, frozen: true }, checkpoint) : null;
  const last = baseline.lastPurchaseCheckpoint ? play({ ...options, policy: { ...options.policy, volley: false }, observe: false, snapshots: false, frozen: true }, baseline.lastPurchaseCheckpoint) : null;
  return { afterLastPurchaseNoVolley: last ? { status: last.status, lives: last.lives, duration: last.duration, equivalent: last.status === "won" && last.lives >= baseline.lives } : null, reallocation: reallocationProbes(baseline, options), excluded: null, probes, sustainedWave: checkpoint?.game.wave ?? null, sustainedTime: checkpoint ? checkpoint.tick * original.STEP : null,
    noVolley: noVolley ? { status: noVolley.status, lives: noVolley.lives, duration: noVolley.duration, equivalent: noVolley.status === "won" && noVolley.lives >= baseline.lives } : null };
}

/** Test legal late reallocation, not just "all slots maxed => nothing to do". No oracle placement search. */
export function reallocationProbes(baseline: Result, options: Options) {
  const checkpoint = baseline.checkpoints.find(cp => cp.game.wave >= Math.ceil(mapById(options.map).waves * 0.7) && cp.game.gold >= 600);
  if (!checkpoint) return null;
  const control = play({ ...options, observe: false, snapshots: false, frozen: true }, checkpoint);
  const variants = ([["archer", "ballista"], ["catapult", "ballista"], ["ballista", "archer"]] as const).flatMap(([from, to]) => {
    const cp = structuredClone(checkpoint);
    const chosen = cp.game.towers.filter(t => t.kind === from).slice(0, 2);
    if (!chosen.length) return [];
    const initialGold = cp.game.gold;
    for (const tower of chosen) {
      original.sell(cp.game, tower.plot);
      if (!original.build(cp.game, tower.plot, to) || !original.upgrade(cp.game, tower.plot) || !original.upgrade(cp.game, tower.plot, to === "archer" && mapById(cp.game.map).archerBranches ? "lune" : undefined)) throw new Error("Reallocation fixture could not fund replacement");
    }
    const result = play({ ...options, observe: false, snapshots: false, frozen: true }, cp);
    return [{ from, to, count: chosen.length, netCost: initialGold - cp.game.gold, status: result.status, lives: result.lives }];
  });
  return { wave: checkpoint.game.wave, time: checkpoint.tick * original.STEP, gold: checkpoint.game.gold, control: { status: control.status, lives: control.lives }, variants };
}

/** Whole-game state/RNG equivalence, not just matching wins; rich branch/volley combat across all foe kinds. */
export function selfTest() {
  if (!observed.AUDIT_BUILD) throw new Error("Self-test requires the observed build");
  for (const seed of [1, 7, 31]) {
    const a = original.createGame("watch", seed), b = observed.createGame("watch", seed);
    a.gold = b.gold = 20_000;
    const audit = beginAudit(b);
    const setup = (game: Game, sim: Engine) => {
      const kinds = ["archer", "archer", "ballista", "catapult", "frost", "ballista"] as const;
      for (let i = 0; i < kinds.length; i++) {
        sim.build(game, i, kinds[i]); sim.upgrade(game, i);
        sim.upgrade(game, i, sim.atFork(game, sim.towerOn(game, i)!) ? i % 2 ? "lune" : "fire" : undefined);
      }
      game.wave = 8; sim.callWave(game);
    };
    setup(a, original); setup(b, observed);
    for (let tick = 1; tick <= 12_000 && a.status === "playing"; tick++) {
      audit.time = tick * original.STEP;
      for (const [game, sim] of [[a, original], [b, observed]] as const) {
        sim.step(game, sim.STEP);
        if (tick % 30 === 0) { const lead = sim.leadFoe(game); if (lead) sim.castVolley(game, lead.x, lead.y); }
      }
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Observed game diverged at seed ${seed}, tick ${tick}`);
    }
    const metrics = finishAudit(b, audit);
    if (!metrics.bySource.ballista?.hits || !metrics.bySource["archer-fire"]?.hits || !metrics.bySource.volley?.hits || !metrics.healed) throw new Error("Equivalence fixture did not exercise damage/burn/volley/healing");
  }
  const policy: Policy = { strategy: "mixed", economy: "staged", branch: "balanced", placement: "coverage", volley: true, early: false, cap: null };
  const options: Options = { map: "meadow", seed: 7, policy, observe: true, snapshots: true };
  const baseline = play(options);
  const control = play({ ...options, observe: false, snapshots: false });
  if (baseline.stateHash !== control.stateHash) throw new Error("Full-run observer divergence");
  for (const checkpoint of baseline.checkpoints) {
    const resumed = play({ ...options, observe: false, snapshots: false }, checkpoint);
    if (resumed.stateHash !== baseline.stateHash) throw new Error(`Suffix checkpoint divergence at wave ${checkpoint.game.wave}`);
  }
  const piercing = verifyPiercing(original, original.STUDY_VARIANT);
  const range = verifyRange(original, original.STUDY_VARIANT);
  return { range, piercing, variant: original.STUDY_VARIANT, richEquivalenceSeeds: [1, 7, 31], ticksPerSeed: 12_000, fullRun: "meadow seed 7 mixed", suffixes: baseline.checkpoints.length, mapCount: mapById("meadow").waves };
}
