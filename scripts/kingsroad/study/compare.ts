import { expectedRanges, isSpacingArm, isVariant, type Variant } from "./variant";
import { FOES } from "../../../src/lib/kingsroad/sim/balance";
import { MAPS } from "../../../src/lib/kingsroad/sim/maps";
import type { FoeKind, MapId } from "../../../src/lib/kingsroad/sim/types";
import type { Policy, Strategy } from "./policy";
import type { Result } from "./runner";

export type ComparisonRow = Omit<Result, "checkpoints" | "lastPurchaseCheckpoint">;
export interface LabeledRow { matrix: string; row: ComparisonRow }
export const CONTROL_MAPS: MapId[] = ["ford", "rivers", "citadel", "harvest", "hairpin", "watch"];
export const EARLY_MAPS: MapId[] = ["meadow", "ford", "crossroads", "switchback", "rivers"];
const MAIN: Strategy[] = ["ballista", "archer", "mixed"];
export const basePolicy: Policy = { strategy: "mixed", economy: "staged", branch: "balanced", placement: "coverage", volley: true, early: false, cap: null };
export function configurationKey(row: Pick<ComparisonRow, "map" | "seed" | "policy">): string {
  const p = row.policy;
  return [row.map, row.seed, p.strategy, p.economy, p.branch, p.placement, p.volley, p.early, p.cap ?? ""].join("/");
}
export function plannedComparisons(variant: Variant = "three-hit"): { matrix: string; map: MapId; seed: number; policy: Policy }[] {
  const rows: ReturnType<typeof plannedComparisons> = [];
  const add = (matrix: string, maps: readonly MapId[], seeds: number[], strategies: Strategy[], patch: Partial<Policy> = {}) => {
    for (const map of maps) for (const seed of seeds) for (const strategy of strategies) {
      const cap = matrix === "budget" ? MAPS.find(m => m.id === map)!.plots.length * 230 : null;
      rows.push({ matrix, map, seed, policy: { ...basePolicy, strategy, ...patch, cap } });
    }
  };
  add("primary", MAPS.map(m => m.id), [1, 2, 3, 4, 5, 6, 7, 8], MAIN);
  add("budget", CONTROL_MAPS, [1, 2, 3, 4], MAIN);
  add("no-volley", CONTROL_MAPS, [1, 2, 3, 4], MAIN, { volley: false });
  add("pure", CONTROL_MAPS, [1, 2, 3, 4], ["pure-ballista", "pure-archer"]);
  add("lines", CONTROL_MAPS, [1, 2, 3, 4], ["ballista", "mixed"], { placement: "lines" });
  add("rush", CONTROL_MAPS, [1, 2, 3, 4], MAIN, { economy: "rush" });
  add("early-extra", EARLY_MAPS, Array.from({ length: 24 }, (_, i) => i + 9), MAIN);
  if (variant === "range-80") add("fixed-placement", CONTROL_MAPS, [1, 2, 3, 4], ["ballista", "mixed"], { placement: "baseline-coverage" });
  return rows;
}

export function validateRow(row: ComparisonRow): void {
  if (!row.metrics || !["won", "lost"].includes(row.status)) throw new Error("Missing telemetry or non-terminal/timeout run");
  if (!isVariant(row.variant)) throw new Error("Missing/unknown variant tag");
  if ((row.variant === "range-80" || row.ballistaRanges) && JSON.stringify(row.ballistaRanges) !== JSON.stringify(expectedRanges(row.variant))) throw new Error("Variant range metadata mismatch");
  const m = row.metrics;
  if (![row.seed, row.duration, row.lives, row.gold, row.spent, m.spawnedHp, m.healed, m.useful, m.leakedHp, m.livingHp].every(Number.isFinite)) throw new Error("Non-finite experiment measurements");
  if (!/^[0-9a-f]{64}$/.test(row.stateHash)) throw new Error("Invalid terminal hash");
  const hpError = m.spawnedHp + m.healed - m.useful - m.leakedHp - m.livingHp;
  if (Math.abs(hpError) > Math.max(0.0001, m.spawnedHp * 1e-8)) throw new Error("Invalid HP ledger");
  const gold = MAPS.find(map => map.id === row.map)!.startGold + row.decisions.earlyGold - row.spent
    + Object.entries(m.kills).reduce((sum, [kind, n]) => sum + FOES[kind as FoeKind].gold * n, 0);
  if (row.gold !== gold) throw new Error("Invalid gold ledger");
  const damage = Object.values(m.bySource).reduce((sum, d) => sum + d!.useful, 0);
  if (!Number.isFinite(damage) || Math.abs(damage - m.useful) > Math.max(0.0001, damage * 1e-8)) throw new Error("Invalid source-damage ledger");
  const b = m.bySource.ballista;
  if (b && row.variant === "three-hit" && (Object.keys(b.hitHistogram).some(h => Number(h) > 3) || b.beyondThirdUseful !== 0)) throw new Error("Three-hit limit violated");
}
export function pairComparisons(baseline: LabeledRow[], experiment: LabeledRow[], complete = true, experimentVariant: Exclude<Variant, "baseline"> = "three-hit") {
  const index = (rows: LabeledRow[], variant: Variant) => {
    const map = new Map<string, LabeledRow>();
    for (const item of rows) {
      if (item.row.variant !== variant) throw new Error("Wrong arm tag");
      validateRow(item.row);
      const key = `${item.matrix}/${configurationKey(item.row)}`;
      if (map.has(key)) throw new Error(`Duplicate comparison ${key}`);
      map.set(key, item);
    }
    return map;
  };
  const a = index(baseline, "baseline"), b = index(experiment, experimentVariant);
  if (a.size !== b.size || [...a.keys()].some(k => !b.has(k))) throw new Error("Missing or mismatched comparison arm");
  if (complete) {
    const expected = plannedComparisons(experimentVariant).map(r => `${r.matrix}/${configurationKey(r)}`);
    if (a.size !== expected.length || expected.some(key => !a.has(key))) throw new Error("Incomplete/unexpected experimental matrix");
  }
  return [...a].map(([key, item]) => {
    const other = b.get(key)!;
    // Spacing arms change every enemy timing, so archer-only pairs are the intended effect there, not a control.
    if (!isSpacingArm(experimentVariant) && !item.row.towers.some(t => t.kind === "ballista") && !other.row.towers.some(t => t.kind === "ballista") && item.row.stateHash !== other.row.stateHash) throw new Error("Non-Ballista control changed");
    return { matrix: item.matrix, baseline: item.row, experiment: other.row };
  });
}
export type Pair = ReturnType<typeof pairComparisons>[number];
export function comparisonStats(pairs: Pair[]) {
  const mean = (values: number[]) => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  return {
    n: pairs.length, baselineWins: pairs.filter(p => p.baseline.status === "won").length, experimentWins: pairs.filter(p => p.experiment.status === "won").length,
    baselineMeanLives: mean(pairs.map(p => p.baseline.lives)), experimentMeanLives: mean(pairs.map(p => p.experiment.lives)), meanLifeDelta: mean(pairs.map(p => p.experiment.lives - p.baseline.lives)),
    wonToLost: pairs.filter(p => p.baseline.status === "won" && p.experiment.status === "lost").length,
    lostToWon: pairs.filter(p => p.baseline.status === "lost" && p.experiment.status === "won").length,
    fewerLives: pairs.filter(p => p.experiment.lives < p.baseline.lives).length, moreLives: pairs.filter(p => p.experiment.lives > p.baseline.lives).length,
    unchangedTerminalState: pairs.filter(p => p.baseline.stateHash === p.experiment.stateHash).length,
    // Runtime comparisons deliberately use only pairs that win in both arms.
    bothWin: pairs.filter(p => p.baseline.status === "won" && p.experiment.status === "won").length,
    meanMinuteDeltaBothWin: mean(pairs.filter(p => p.baseline.status === "won" && p.experiment.status === "won").map(p => (p.experiment.duration - p.baseline.duration) / 60)),
    baselineMeanGold: mean(pairs.map(p => p.baseline.gold)), experimentMeanGold: mean(pairs.map(p => p.experiment.gold)),
    baselineMeanSpent: mean(pairs.map(p => p.baseline.spent)), experimentMeanSpent: mean(pairs.map(p => p.experiment.spent)),
  };
}
