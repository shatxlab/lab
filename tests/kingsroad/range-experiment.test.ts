import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOWERS } from "@/lib/kingsroad/sim/balance";
import { studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { expectedRanges, isVariant, variantBalanceSource, variantSource, type Variant } from "../../scripts/kingsroad/study/variant";
import { pairComparisons, plannedComparisons, validateRow, type ComparisonRow, type LabeledRow } from "../../scripts/kingsroad/study/compare";

let dir: string, summaryBundle: string;
const rows = new Map<Variant, ComparisonRow[]>(), bundles = new Map<Variant, string>();
let fixed: ComparisonRow[];
beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "kr-range-test-"));
  for (const variant of ["baseline", "range-80"] as const) {
    const outfile = resolve(dir, `${variant}.mjs`), out = resolve(dir, `${variant}.jsonl`);
    await build({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    bundles.set(variant, outfile);
    execFileSync(process.execPath, [outfile, "--maps=meadow", "--seeds=1", "--strategies=ballista,archer,mixed", `--out=${out}`], { stdio: "pipe" });
    rows.set(variant, readFileSync(out, "utf8").trim().split("\n").map(line => JSON.parse(line)));
  }
  const out = resolve(dir, "fixed.jsonl");
  execFileSync(process.execPath, [bundles.get("range-80")!, "--maps=meadow", "--seeds=1", "--strategies=ballista,mixed", "--placement=baseline-coverage", `--out=${out}`], { stdio: "pipe" });
  fixed = readFileSync(out, "utf8").trim().split("\n").map(line => JSON.parse(line));
  summaryBundle = resolve(dir, "summarize.mjs");
  await build({ entryPoints: [resolve("scripts/kingsroad/study/summarize.ts")], outfile: summaryBundle, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") } });
}, 30_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
const labeled = (variant: Variant): LabeledRow[] => rows.get(variant)!.map(row => ({ matrix: "primary", row: structuredClone(row) }));

describe("range-only offline diagnostic", () => {
  it("predeclares exactly 0.8x range at all three levels and leaves game source unlimited", () => {
    expect(isVariant("range-80")).toBe(true); expect(isVariant("range-70")).toBe(false);
    expect(expectedRanges("range-80")).toEqual([112, 120, 132]);
    const source = readFileSync(resolve("src/lib/kingsroad/sim/game.ts"), "utf8");
    expect(variantSource(source, "range-80")).toBe(source);
    expect(variantSource(source, "three-hit")).not.toBe(source);
  });
  it("changes precisely three Ballista range literals, with no other balance edits", () => {
    const source = readFileSync(resolve("src/lib/kingsroad/sim/balance.ts"), "utf8");
    expect(variantBalanceSource(source, "baseline")).toBe(source);
    expect(variantBalanceSource(source, "three-hit")).toBe(source);
    expect(variantBalanceSource(source, "range-80")).toBe(source.replace("range: 140,", "range: 112,").replace("range: 150,", "range: 120,").replace("range: 165,", "range: 132,"));
  });
  it("fails closed on missing/duplicate blocks, changed stock ranges or unknown variants", () => {
    const source = readFileSync(resolve("src/lib/kingsroad/sim/balance.ts"), "utf8");
    expect(() => variantBalanceSource("", "range-80")).toThrow("exactly once");
    expect(() => variantBalanceSource(source + "  ballista: {\n", "range-80")).toThrow("exactly once");
    expect(() => variantBalanceSource(source.replace("range: 140,", "range: 141,"), "range-80")).toThrow("three stock ranges");
    expect(() => variantBalanceSource(source, "range-70" as Variant)).toThrow("Unknown");
  });
  it("never mutates the shipping balance object or any of the eight frozen input files", () => {
    expect(TOWERS.ballista.levels.map(l => l.range)).toEqual([140, 150, 165]);
    const manifest = JSON.parse(readFileSync(resolve("reports/kingsroad-study/manifest.json"), "utf8"));
    for (const [path, hash] of Object.entries(manifest.inputs)) expect(createHash("sha256").update(readFileSync(resolve(path))).digest("hex")).toBe(hash);
  });
  it("uses the selected ranges in actual whole-game execution, not only a report label", () => {
    for (const row of rows.get("range-80")!) { expect(row.ballistaRanges).toEqual([112, 120, 132]); validateRow(row); }
    for (const row of rows.get("baseline")!) expect(row.ballistaRanges).toEqual([140, 150, 165]);
    expect(rows.get("range-80")!.find(r => r.policy.strategy === "ballista")!.stateHash).not.toBe(rows.get("baseline")!.find(r => r.policy.strategy === "ballista")!.stateHash);
  });
  it("keeps unlimited piercing, exceeding three contacts in real range-variant combat", () => {
    const source = rows.get("range-80")!.find(r => r.policy.strategy === "ballista")!.metrics!.bySource.ballista!;
    expect(Math.max(...Object.keys(source.hitHistogram).map(Number))).toBeGreaterThan(3);
    expect(source.beyondThirdUseful).toBeGreaterThan(0);
  });
  it("proves real acquisition boundaries, flight coupling, observer/suffix parity and both placement modes", () => {
    const test = JSON.parse(execFileSync(process.execPath, [bundles.get("range-80")!, "--self-test"], { encoding: "utf8" }));
    expect(test.variant).toBe("range-80"); expect(test.suffixes).toBe(13);
    expect(test.richEquivalenceSeeds).toEqual([1, 7, 31]); expect(test.ticksPerSeed).toBe(12_000);
    expect(test.range.ranges).toEqual([112, 120, 132]); expect(test.range.acquisitionFixtures).toBe(12);
    expect(test.range.groundAndAir).toBe(true); expect(test.range.projectileSpeed).toBe(460); expect(test.range.lifetimeFactor).toBe(1.15);
    expect(test.range.fixedRankMaps).toBe(20); expect(test.range.changedRankMaps).toHaveLength(20);
    expect(test.piercing.simultaneousFixtures).toBe(30); expect(test.piercing.sequential).toBe(true);
  }, 30_000);
  it("preserves non-Ballista state, decisions and telemetry exactly", () => {
    const a = rows.get("baseline")!.find(r => r.policy.strategy === "archer")!, b = rows.get("range-80")!.find(r => r.policy.strategy === "archer")!;
    expect(a.stateHash).toBe(b.stateHash); expect(a.decisions).toEqual(b.decisions); expect(a.metrics).toEqual(b.metrics);
  });
  it("freezes the original Ballista plot ranking in the labeled fixed-placement control", () => {
    const a = rows.get("baseline")!.find(r => r.policy.strategy === "ballista")!;
    const b = fixed.find(r => r.policy.strategy === "ballista")!;
    expect(b.policy.placement).toBe("baseline-coverage"); expect(b.ballistaRanges).toEqual([112, 120, 132]);
    const plots = (r: ComparisonRow) => r.decisions.purchases.filter(p => p.type === "build").map(p => p.plot);
    expect(plots(b)).toEqual(plots(a));
    expect(plots(rows.get("range-80")!.find(r => r.policy.strategy === "ballista")!)).not.toEqual(plots(a));
  });
});

describe("range comparison isolation", () => {
  it("requires an explicitly selected range arm, rather than silently treating it as three-hit", () => {
    expect(() => pairComparisons(labeled("baseline"), labeled("range-80"), false)).toThrow("Wrong arm");
    expect(pairComparisons(labeled("baseline"), labeled("range-80"), false, "range-80")).toHaveLength(3);
  });
  it("retains the original 1,152-pair piercing design while adding 48 fixed-placement range pairs", () => {
    expect(plannedComparisons()).toHaveLength(1152);
    const plan = plannedComparisons("range-80"); expect(plan).toHaveLength(1200);
    expect(new Set(plan.map(r => JSON.stringify(r))).size).toBe(1200);
    const fixed = plan.filter(p => p.matrix === "fixed-placement"); expect(fixed).toHaveLength(48);
    expect(fixed.every(p => p.policy.placement === "baseline-coverage")).toBe(true);
    expect(plan.filter(p => p.matrix === "primary")).toHaveLength(480);
    expect(plan.filter(p => p.matrix === "budget")).toHaveLength(72);
    expect(plan.filter(p => p.matrix === "early-extra")).toHaveLength(360);
  });
  it("rejects mislabeled parameter sets even if they have valid ledgers and terminal hashes", () => {
    const r = structuredClone(rows.get("range-80")![0]); r.ballistaRanges = [140, 150, 165];
    expect(() => validateRow(r)).toThrow("range metadata mismatch");
    r.ballistaRanges = [112, 120, 132]; r.variant = "three-hit";
    expect(() => validateRow(r)).toThrow("range metadata mismatch");
  });
  it("refuses experimental rows in the baseline-only report without writing misleading output", () => {
    const out = resolve(dir, "refused-report");
    expect(() => execFileSync(process.execPath, [summaryBundle, dir, out], { stdio: "pipe" })).toThrow("Baseline summarizer refuses experimental variants");
    expect(existsSync(out)).toBe(false);
  });
});
