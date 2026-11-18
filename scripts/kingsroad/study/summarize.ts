import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAPS } from "../../../src/lib/kingsroad/sim/maps";
import { roadWithin } from "../../../src/lib/kingsroad/sim/path";
import type { FoeKind } from "../../../src/lib/kingsroad/sim/types";
import { FOES, TOWERS } from "../../../src/lib/kingsroad/sim/balance";
import type { Result } from "./runner";
import type { Damage } from "./telemetry";
import type { pacingProbes } from "./runner";

type Row = Omit<Result, "checkpoints" | "lastPurchaseCheckpoint"> & { pacing?: ReturnType<typeof pacingProbes> };
const input = process.argv[2], output = process.argv[3];
if (!input || !output) throw new Error("Usage: node study-summarize.mjs INPUT_DIRECTORY OUTPUT_DIRECTORY");
const files = readdirSync(input).filter(f => f.endsWith(".jsonl")).sort();
const datasets = files.map(file => ({ name: file.replace(/\.jsonl$/, ""), rows: readFileSync(resolve(input, file), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Row) }));
const all = datasets.flatMap(d => d.rows.map(r => ({ dataset: d.name, ...r })));
if (all.some(r => r.variant && r.variant !== "baseline")) throw new Error("Baseline summarizer refuses experimental variants; use the paired comparison report");
const primary = all.filter(r => r.dataset.startsWith("baseline-"));
if (primary.length !== MAPS.length * 8 * 3) throw new Error("Incomplete primary matrix: expected 20 maps × 8 seeds × 3 strategies");
for (const row of all) if (!row.metrics || Math.abs(row.metrics.ledgerError) > Math.max(0.0001, row.metrics.spawnedHp * 1e-8)) throw new Error("Missing/invalid HP ledger");
for (const row of all) {
  const rewards = Object.entries(row.metrics!.kills).reduce((sum, [kind, count]) => sum + FOES[kind as FoeKind].gold * count, 0);
  const gold = MAPS.find(m => m.id === row.map)!.startGold + rewards + row.decisions.earlyGold - row.spent;
  const sourceDamage = Object.values(row.metrics!.bySource).reduce((sum, d) => sum + d!.useful, 0);
  if (Math.abs(row.gold - gold) > 1e-8 || Math.abs(sourceDamage - row.metrics!.useful) > Math.max(0.0001, sourceDamage * 1e-8)) throw new Error("Invalid gold/source-damage ledger");
}
const mean = (a: number[]) => a.length ? a.reduce((a, b) => a + b, 0) / a.length : null;
const sum = (a: number[]) => a.reduce((a, b) => a + b, 0);
const groups = <T>(rows: T[], key: (r: T) => string) => [...new Set(rows.map(key))].map(id => ({ id, rows: rows.filter(r => key(r) === id) }));
function stats(rows: Row[]) {
  return { n: rows.length, wins: rows.filter(r => r.status === "won").length, timeouts: rows.filter(r => r.status === "timeout").length,
    meanLivesIncludingLosses: mean(rows.map(r => r.lives)), meanMinutesIncludingLosses: mean(rows.map(r => r.duration / 60)), meanSpent: mean(rows.map(r => r.spent)), meanGold: mean(rows.map(r => r.gold)),
    meanPostPurchaseMinutesWinsOnly: mean(rows.filter(r => r.status === "won" && r.postPurchaseSeconds !== null).map(r => r.postPurchaseSeconds! / 60)) };
}
function sources(rows: Row[], opening = false) {
  const result: Record<string, Record<string, unknown>> = {};
  const names = [...new Set(rows.flatMap(r => Object.keys((opening ? r.opening : r.metrics)?.bySource ?? {})))];
  for (const name of names) {
    const data = rows.map(r => ((opening ? r.opening : r.metrics)?.bySource as Record<string, Damage> | undefined)?.[name]).filter((d): d is Damage => !!d);
    const total = (key: keyof Damage) => sum(data.map(d => typeof d[key] === "number" ? d[key] as number : 0));
    const histogram: Record<string, number> = {};
    for (const d of data) for (const [hits, n] of Object.entries(d.hitHistogram)) histogram[hits] = (histogram[hits] ?? 0) + n;
    result[name] = {
      fired: total("fired"), retired: total("retired"), pending: total("pending"), hits: total("hits"), useful: total("useful"), applied: total("applied"), overkill: total("overkill"),
      pierceUseful: total("pierceUseful"), beyondThirdUseful: total("beyondThirdUseful"), burnUseful: total("burnUseful"), arithmeticMarkShare: total("markUsefulShare"),
      contactsPerFiredShot: total("hits") / (total("fired") || 1), zeroHitRetirementPercent: 100 * total("missed") / (total("retired") || 1),
      overkillPercent: 100 * total("overkill") / (total("applied") || 1), targetAvailabilityPercent: 100 * total("targetSeconds") / (total("activeSeconds") || 1),
      pierceUsefulPercent: 100 * total("pierceUseful") / (total("useful") || 1), beyondThirdUsefulPercent: 100 * total("beyondThirdUseful") / (total("useful") || 1),
      hitHistogram: histogram,
    };
  }
  return result;
}
const pacing = all.filter(r => r.pacing).map(r => ({ map: r.map, seed: r.seed, strategy: r.policy.strategy, status: r.status, lives: r.lives, duration: r.duration, lastPurchase: r.lastPurchase, lastPurchaseWave: r.lastPurchaseWave, gold: r.gold, spent: r.spent, ...r.pacing! }));
for (const r of all.filter(r => r.pacing)) {
  const control = primary.find(b => b.map === r.map && b.seed === r.seed && b.policy.strategy === r.policy.strategy);
  if (!control || control.stateHash !== r.stateHash) throw new Error("Pacing baseline did not reproduce primary terminal state");
}
const geometry = MAPS.map(map => {
  const length = sum(map.roads.map(r => r.length));
  return { map: map.id, plots: map.plots.length, roads: map.roads.length, waveCount: map.waves,
    coverage: Object.fromEntries(Object.entries(TOWERS).map(([kind, def]) => {
      const fractions = map.plots.map(p => sum(map.roads.map(road => roadWithin(road, p.x, p.y, def.levels[2].range))) / length).sort((a, b) => b - a);
      return [kind, { maxBaseRange: def.levels[2].range, meanPlotRouteFraction: mean(fractions), meanBestFiveRouteFraction: mean(fractions.slice(0, 5)) }];
    })) };
});
const csvHead = ["dataset", "map", "seed", "strategy", "economy", "branch", "placement", "volley", "early", "cap", "status", "lives", "minutes", "spent", "gold", "last_purchase_minutes", "last_purchase_wave", "construction_tail_minutes", "final_direct_choices", "final_rebuild_choices", "useful_damage", "healed_hp", "state_sha256"];
const csvRows = all.map(r => [r.dataset, r.map, r.seed, r.policy.strategy, r.policy.economy, r.policy.branch, r.policy.placement, r.policy.volley, r.policy.early, r.policy.cap, r.status, r.lives, r.duration / 60, r.spent, r.gold, r.lastPurchase === null ? null : r.lastPurchase / 60, r.lastPurchaseWave, r.postPurchaseSeconds === null ? null : r.postPurchaseSeconds / 60, r.finalAffordableActions, r.finalRebuildChoices, r.metrics!.useful, r.metrics!.healed, r.stateHash]);
const rounded = (_: string, value: unknown) => typeof value === "number" ? Math.round(value * 10000) / 10000 : value;
mkdirSync(output, { recursive: true });
const json = (name: string, value: unknown) => writeFileSync(resolve(output, name), JSON.stringify(value, rounded, 2) + "\n");
writeFileSync(resolve(output, "runs.csv"), [csvHead, ...csvRows].map(row => row.map(v => typeof v === "number" ? Math.round(v * 10000) / 10000 : v ?? "").join(",")).join("\n") + "\n");
json("summary.json", {
  fullRunsIncludingPacingReruns: all.length, distinctFullConfigurations: new Set(all.map(r => `${r.map}/${r.seed}/${JSON.stringify(r.policy)}`)).size,
  primary: groups(primary, r => r.policy.strategy).map(g => ({ strategy: g.id, ...stats(g.rows), opening120Seconds: sources(g.rows, true), wholeRun: sources(g.rows) })),
  maps: MAPS.map(m => ({ map: m.id, strategies: groups(primary.filter(r => r.map === m.id), r => r.policy.strategy).map(g => ({ strategy: g.id, ...stats(g.rows) })) })),
  matrices: datasets.map(d => ({ name: d.name, maps: [...new Set(d.rows.map(r => r.map))], seeds: [...new Set(d.rows.map(r => r.seed))], policies: [...new Set(d.rows.map(r => JSON.stringify(r.policy)))].map(p => JSON.parse(p)), groups: groups(d.rows, r => r.policy.strategy).map(g => ({ strategy: g.id, ...stats(g.rows) })) })),
  pacing: { winningBaselines: pacing.filter(r => r.status === "won").length, frozenPurchaseSuffixes: sum(pacing.map(r => r.probes.length)), volleyCutoffSuffixes: sum(pacing.map(r => Number(!!r.noVolley) + Number(!!r.afterLastPurchaseNoVolley))), reallocationControls: pacing.filter(r => r.reallocation).length, reallocationVariants: sum(pacing.map(r => r.reallocation?.variants.length ?? 0)),
    maps: groups(pacing, r => `${r.map}/${r.strategy}`).map(g => ({ case: g.id, n: g.rows.length, wins: g.rows.filter(r => r.status === "won").length, meanSufficientTimeMinutes: mean(g.rows.filter(r => r.sustainedTime !== null).map(r => r.sustainedTime! / 60)), meanRemainingMinutes: mean(g.rows.filter(r => r.sustainedTime !== null).map(r => (r.duration - r.sustainedTime!) / 60)), afterLastPurchaseNoVolleyEquivalent: g.rows.filter(r => r.afterLastPurchaseNoVolley?.equivalent).length })) },
  geometry,
});
json("pacing.json", pacing);
const inputPaths = ["src/lib/kingsroad/sim/balance.ts", "src/lib/kingsroad/sim/game.ts", "src/lib/kingsroad/sim/maps.ts", "src/lib/kingsroad/sim/path.ts", "src/lib/kingsroad/sim/types.ts", "src/lib/kingsroad/sim/waves.ts", "src/lib/tower/sim/balance.ts", "src/lib/tower/sim/random.ts"];
json("manifest.json", { baselineCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), inputs: Object.fromEntries(inputPaths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])), notes: "Shipping simulation unchanged. Deterministic bots, not human playtests. Terminal-state hashes include full RNG/combat state. Raw JSONL can be regenerated using matrix policies/maps/seeds in summary.json." });
console.log(`Wrote ${all.length} full-run rows, ${pacing.length} pacing cases and summaries to ${output}`);
