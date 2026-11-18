import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expectedRanges, isSpacingArm, isVariant } from "./variant";
import { roadWithin } from "../../../src/lib/kingsroad/sim/path";
import { MAPS } from "../../../src/lib/kingsroad/sim/maps";
import { comparisonStats, configurationKey, CONTROL_MAPS, EARLY_MAPS, pairComparisons, type ComparisonRow, type LabeledRow } from "./compare";

const input = process.argv[2], output = process.argv[3];
if (!input || !output) throw new Error("Usage: node study-compare.mjs RAW_DIRECTORY OUTPUT_DIRECTORY [three-hit|range-80|cadence-2x|matched-2x|density-only]");
const variant = process.argv[4] ?? "three-hit";
if (!isVariant(variant) || variant === "baseline") throw new Error("Select an experimental variant: three-hit, range-80, cadence-2x, matched-2x or density-only");
const rawInputs: Record<string, string> = {};
function readArm(variant: string): LabeledRow[] {
  const dir = resolve(input, variant);
  return readdirSync(dir).filter(file => file.endsWith(".jsonl")).sort().flatMap(file => {
    const matrix = file.startsWith("primary-") ? "primary" : file.replace(/\.jsonl$/, "");
    const contents = readFileSync(resolve(dir, file), "utf8");
    rawInputs[`${variant}/${file}`] = createHash("sha256").update(contents).digest("hex");
    return contents.trim().split("\n").filter(Boolean).map(line => ({ matrix, row: JSON.parse(line) as ComparisonRow }));
  });
}
const baseline = readArm("baseline"), experiment = readArm(variant);
const pairs = pairComparisons(baseline, experiment, true, variant);
const oldManifest = JSON.parse(readFileSync("reports/kingsroad-study/manifest.json", "utf8")) as { baselineCommit: string; inputs: Record<string, string> };
for (const [file, hash] of Object.entries(oldManifest.inputs)) {
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== hash) throw new Error(`Shipping input changed: ${file}`);
}
// Baseline must reproduce the frozen prior study, not just resemble its aggregate win rates.
const [header, ...lines] = readFileSync("reports/kingsroad-study/runs.csv", "utf8").trim().split("\n").map(line => line.split(","));
const history = new Map<string, string>();
for (const line of lines) {
  const r = Object.fromEntries(header.map((h, i) => [h, line[i]]));
  const key = [r.map, r.seed, r.strategy, r.economy, r.branch, r.placement, r.volley, r.early, r.cap].join("/");
  if (history.has(key) && history.get(key) !== r.state_sha256) throw new Error("Conflicting historical baseline hashes");
  history.set(key, r.state_sha256);
}
let historicalMatches = 0;
for (const pair of pairs) {
  const hash = history.get(configurationKey({ ...pair.baseline, policy: { ...pair.baseline.policy, placement: pair.baseline.policy.placement === "baseline-coverage" ? "coverage" : pair.baseline.policy.placement } }));
  if (hash) {
    if (hash !== pair.baseline.stateHash) throw new Error("Historical baseline drift");
    historicalMatches++;
  } else if (pair.matrix !== "early-extra") throw new Error("Expected historical control is missing");
}
if (historicalMatches !== (variant === "range-80" ? 840 : 792)) throw new Error("Incomplete historical baseline verification");
const grouped = (filter: (p: typeof pairs[number]) => boolean) => {
  const selected = pairs.filter(filter);
  return [...new Set(selected.map(p => p.baseline.policy.strategy))].map(strategy => ({ strategy, ...comparisonStats(selected.filter(p => p.baseline.policy.strategy === strategy)) }));
};
const matrices = [...new Set(pairs.map(p => p.matrix))].map(matrix => ({ matrix, strategies: grouped(p => p.matrix === matrix) }));
function boltStats(rows: ComparisonRow[]) {
  const d = rows.map(r => r.metrics?.bySource.ballista).filter(d => !!d);
  const sum = (key: "useful" | "pierceUseful" | "beyondThirdUseful" | "fired" | "retired" | "missed" | "hits" | "overkill" | "applied") => d.reduce((s, v) => s + v![key], 0);
  const fired = sum("fired"), useful = sum("useful"), applied = sum("applied");
  return { fired, useful, contactsPerFired: sum("hits") / (fired || 1), zeroHitRetiredPercent: 100 * sum("missed") / (sum("retired") || 1), overkillPercent: 100 * sum("overkill") / (applied || 1), pierceUsefulPercent: 100 * sum("pierceUseful") / (useful || 1), beyondThirdUsefulPercent: 100 * sum("beyondThirdUseful") / (useful || 1), maxRetiredContacts: Math.max(0, ...d.flatMap(v => Object.keys(v!.hitHistogram).map(Number))) };
}
const rounded = (_: string, value: unknown) => typeof value === "number" ? Math.round(value * 10000) / 10000 : value;
mkdirSync(output, { recursive: true });
const json = (file: string, value: unknown) => writeFileSync(resolve(output, file), JSON.stringify(value, rounded, 2) + "\n");
json("summary.json", {
  variant, fullRuns: baseline.length + experiment.length, matchedPairs: pairs.length, historicalMatches,
  nonBallistaIdenticalStates: pairs.filter(p => !p.baseline.towers.some(t => t.kind === "ballista") && !p.experiment.towers.some(t => t.kind === "ballista") && p.baseline.stateHash === p.experiment.stateHash).length,
  matrices,
  ...(variant === "range-80" ? {
    placementMatchedSubset: {
      adaptive: grouped(p => p.matrix === "primary" && CONTROL_MAPS.includes(p.baseline.map) && p.baseline.seed <= 4 && p.baseline.policy.strategy !== "archer"),
      fixed: grouped(p => p.matrix === "fixed-placement"),
    },
    earlyCombined32Seeds: grouped(p => ["primary", "early-extra"].includes(p.matrix) && EARLY_MAPS.includes(p.baseline.map)),
    rangeGeometry: MAPS.map(map => {
    const fraction = (range: number) => map.plots.reduce((total, plot) => total + map.roads.reduce((s, road) => s + roadWithin(road, plot.x, plot.y, range), 0) / map.roads.reduce((s, road) => s + road.length, 0), 0) / map.plots.length;
    return { map: map.id, baselineBallista: fraction(165), experimentBallista: fraction(expectedRanges(variant)[2]), archer: fraction(110) };
  }) } : {}),
  primaryMaps: MAPS.map(map => ({ map: map.id, strategies: grouped(p => p.matrix === "primary" && p.baseline.map === map.id) })),
  earlyMaps32Seeds: EARLY_MAPS.map(map => ({ map, strategies: grouped(p => ["primary", "early-extra"].includes(p.matrix) && p.baseline.map === map) })),
  primaryBolts: ["ballista", "mixed"].map(strategy => {
    const selected = pairs.filter(p => p.matrix === "primary" && p.baseline.policy.strategy === strategy);
    return { strategy, baseline: boltStats(selected.map(p => p.baseline)), experiment: boltStats(selected.map(p => p.experiment)) };
  }),
});
const columns = ["matrix", "map", "seed", "strategy", "economy", "placement", "volley", "cap", "baseline_status", `${variant.replaceAll("-", "_")}_status`, "baseline_lives", `${variant.replaceAll("-", "_")}_lives`, "life_delta", "baseline_minutes", `${variant.replaceAll("-", "_")}_minutes`, "baseline_spent", `${variant.replaceAll("-", "_")}_spent`, "baseline_gold", `${variant.replaceAll("-", "_")}_gold`, "baseline_sha256", `${variant.replaceAll("-", "_")}_sha256`];
const csvRows = pairs.map(p => { const a = p.baseline, b = p.experiment; return [p.matrix, a.map, a.seed, a.policy.strategy, a.policy.economy, a.policy.placement, a.policy.volley, a.policy.cap ?? "", a.status, b.status, a.lives, b.lives, b.lives - a.lives, a.duration / 60, b.duration / 60, a.spent, b.spent, a.gold, b.gold, a.stateHash, b.stateHash].map(v => typeof v === "number" ? Math.round(v * 10000) / 10000 : v); });
writeFileSync(resolve(output, "pairs.csv"), [columns, ...csvRows].map(r => r.join(",")).join("\n") + "\n");
json("manifest.json", { baselineCommit: oldManifest.baselineCommit, shippingInputs: oldManifest.inputs, rawInputs, variant, delta: variant === "three-hit" ? "After shot.hitIds.push(foe.id), return false when hitIds.length >= 3 in flyBolt. No other rule/number change." : variant === "cadence-2x" ? "Spawn SPACING runner 0.55->1.1, bat 0.45->0.9, scamp 0.2->0.4 seconds; counts, HP, roads, COLUMN_GAP and all tower stats unchanged." : variant === "matched-2x" ? "Same fast SPACING x2 as cadence-2x; every slow kind (grunt, brute, knight, imp, gargoyle) SPACING x s_w per wave, s_w = 1 - fastStock/slowStock, so each wave keeps its stock length. Counts, HP, roads, COLUMN_GAP, tower stats unchanged." : variant === "density-only" ? "Control: fast SPACING stock; the same per-wave slow shrink s_w as matched-2x, so waves get shorter by the fast stock time. Isolates denser slow columns."  : "Only Ballista L1/L2/L3 range: 140/150/165 -> 112/120/132 (0.8x); unlimited piercing, existing 1.15x bolt-flight coupling preserved.", appliedTo: "Offline in-memory simulation copies only; both observed and unobserved control engines", shipped: false, humanPlaytested: false, guards: `Complete ${pairs.length}-pair design; HP/gold/source ledgers; selected-variant checks; ${historicalMatches} historical terminal hashes; ${isSpacingArm(variant) ? "no non-Ballista identity claim (spacing arms change every enemy timing by design)" : "non-Ballista state equality"}`, notes: "Same seeds do not lock later spawn RNG across altered combat. Runtime deltas use both-winning pairs only. No sufficient-defense pacing remeasurement, branch, cadence or price adjustment. Range changes only in the range-80 arm." });
console.log(`Compared ${pairs.length} pairs / ${baseline.length + experiment.length} full runs; ${historicalMatches} historical baseline hashes match.`);
