import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { isVariant, variantSource, type Variant } from "../../scripts/kingsroad/study/variant";
import { comparisonStats, pairComparisons, plannedComparisons, validateRow, type ComparisonRow, type LabeledRow } from "../../scripts/kingsroad/study/compare";
import { play } from "../../scripts/kingsroad/study/runner";
import { basePolicy } from "../../scripts/kingsroad/study/compare";
import { createGame } from "@/lib/kingsroad/sim/game";
import { verifyFrozenOrShippedInputs } from "./study-inputs";

let dir: string;
const rows = new Map<Variant, ComparisonRow[]>();
const bundles = new Map<Variant, string>();
beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "kr-pierce-test-"));
  for (const variant of ["baseline", "three-hit"] as const) {
    const outfile = resolve(dir, `${variant}.mjs`), out = resolve(dir, `${variant}.jsonl`);
    await build({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    bundles.set(variant, outfile);
    execFileSync(process.execPath, [outfile, "--maps=meadow", "--seeds=1", "--strategies=ballista,archer,mixed", `--out=${out}`], { stdio: "pipe" });
    rows.set(variant, readFileSync(out, "utf8").trim().split("\n").map(line => JSON.parse(line)));
  }
}, 30_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
const labeled = (variant: Variant): LabeledRow[] => rows.get(variant)!.map(row => ({ matrix: "primary", row: structuredClone(row) }));

describe("isolated three-hit variant", () => {
  it("baseline source is byte-identical; the experiment inserts exactly one guarded rule", () => {
    const source = readFileSync(resolve("src/lib/kingsroad/sim/game.ts"), "utf8");
    expect(variantSource(source, "baseline")).toBe(source);
    const delta = "\n    if (shot.hitIds.length >= 3) return false;";
    const changed = variantSource(source, "three-hit");
    expect(changed.split(delta)).toHaveLength(2);
    expect(changed.replace(delta, "")).toBe(source);
  });
  it("rejects unknown variants and missing/duplicate mutation anchors", () => {
    expect(isVariant("baseline")).toBe(true); expect(isVariant("three-hit")).toBe(true);
    expect(isVariant("three_hit")).toBe(false); expect(isVariant("3")).toBe(false);
    expect(() => variantSource("", "wrong" as Variant)).toThrow("Unknown");
    expect(() => variantSource("", "three-hit")).toThrow("exactly once");
    expect(() => variantSource("    shot.hitIds.push(foe.id);\n    shot.hitIds.push(foe.id);", "three-hit")).toThrow("exactly once");
  });
  it("keeps every shipping input at its frozen or deliberately re-shipped hash", () => {
    expect(verifyFrozenOrShippedInputs()).toBeUndefined();
  });
  it("proves observed/control parity and correct unobserved suffixes for the capped variant", () => {
    const result = JSON.parse(execFileSync(process.execPath, [bundles.get("three-hit")!, "--self-test"], { encoding: "utf8" }));
    expect(result.variant).toBe("three-hit");
    expect(result.richEquivalenceSeeds).toEqual([1, 7, 31]); expect(result.suffixes).toBe(13);
    expect(result.piercing.simultaneousFixtures).toBe(33);
    expect(result.piercing.kinds).toHaveLength(11); expect(result.piercing.levels).toEqual([1, 2, 3]);
    expect(result.piercing.sequential).toBe(true); expect(result.piercing.priorHits).toBe(true); expect(result.piercing.deadSkipped).toBe(true);
  }, 30_000);
  it("never exceeds three contacts or retains beyond-third damage in whole-game telemetry", () => {
    for (const row of rows.get("three-hit")!) {
      expect(row.variant).toBe("three-hit"); validateRow(row);
      const b = row.metrics?.bySource.ballista;
      if (b) { expect(Math.max(...Object.keys(b.hitHistogram).map(Number))).toBeLessThanOrEqual(3); expect(b.beyondThirdUseful).toBe(0); }
    }
    const baseline = rows.get("baseline")!.find(r => r.policy.strategy === "ballista")!;
    expect(Math.max(...Object.keys(baseline.metrics!.bySource.ballista!.hitHistogram).map(Number))).toBeGreaterThan(3);
  });
  it("leaves an actual non-Ballista game bit-identical across variants", () => {
    const a = rows.get("baseline")!.find(r => r.policy.strategy === "archer")!;
    const b = rows.get("three-hit")!.find(r => r.policy.strategy === "archer")!;
    expect(b.stateHash).toBe(a.stateHash);
    expect(b.decisions).toEqual(a.decisions); expect(b.metrics).toEqual(a.metrics);
  });
  it("refuses a checkpoint from a different variant instead of silently resuming baseline rules", () => {
    expect(() => play({ map: "meadow", seed: 1, policy: basePolicy }, { variant: "three-hit", game: createGame("meadow", 1), tick: 0, decisions: rows.get("baseline")![0].decisions })).toThrow("different study variant");
  });
});

describe("paired experiment reporting guardrails", () => {
  it("specifies exactly 1,152 unique pairs including 32-seed early coverage and common budgets", () => {
    const plan = plannedComparisons(); expect(plan).toHaveLength(1152);
    expect(new Set(plan.map(r => JSON.stringify(r))).size).toBe(1152);
    expect(plan.filter(r => r.matrix === "primary")).toHaveLength(480);
    expect(plan.filter(r => r.matrix === "budget")).toHaveLength(72);
    expect(plan.filter(r => r.matrix === "early-extra")).toHaveLength(360);
    expect(plan.filter(r => r.matrix === "budget").every(r => r.policy.cap !== null)).toBe(true);
  });
  it("pairs by all policy inputs and labels incomplete runs rather than presenting them as the campaign", () => {
    const paired = pairComparisons(labeled("baseline"), labeled("three-hit"), false);
    expect(paired).toHaveLength(3); expect(comparisonStats(paired).n).toBe(3);
    expect(() => pairComparisons(labeled("baseline"), labeled("three-hit"))).toThrow("Incomplete/unexpected");
  });
  it("rejects duplicated, missing, mismatched-policy and wrong-arm records", () => {
    const a = labeled("baseline"), b = labeled("three-hit");
    expect(() => pairComparisons([...a, a[0]], b, false)).toThrow("Duplicate");
    expect(() => pairComparisons(a, b.slice(1), false)).toThrow("Missing or mismatched");
    b[0].row.policy.economy = "rush";
    expect(() => pairComparisons(a, b, false)).toThrow("Missing or mismatched");
    const wrong = labeled("three-hit"); wrong[0].row.variant = "baseline";
    expect(() => pairComparisons(a, wrong, false)).toThrow("Wrong arm");
  });
  it("rejects non-Ballista drift even when aggregate wins and lives agree", () => {
    const a = labeled("baseline"), b = labeled("three-hit");
    b.find(r => r.row.policy.strategy === "archer")!.row.stateHash = "0".repeat(64);
    expect(() => pairComparisons(a, b, false)).toThrow("Non-Ballista control changed");
  });
  it("rejects broken HP/gold/source ledgers, impossible cap metrics and timeouts", () => {
    const original = rows.get("three-hit")!.find(r => r.policy.strategy === "ballista")!;
    const mutate = (fn: (r: ComparisonRow) => void) => { const r = structuredClone(original); fn(r); return () => validateRow(r); };
    expect(mutate(r => { r.metrics!.spawnedHp += 10; })).toThrow("HP ledger");
    expect(mutate(r => { r.gold++; })).toThrow("gold ledger");
    expect(mutate(r => { r.metrics!.bySource.ballista!.useful++; })).toThrow("source-damage ledger");
    expect(mutate(r => { r.metrics!.bySource.ballista!.hitHistogram[4] = 1; })).toThrow("limit violated");
    expect(mutate(r => { r.metrics!.bySource.ballista!.beyondThirdUseful = 1; })).toThrow("limit violated");
    expect(mutate(r => { r.status = "timeout"; })).toThrow("non-terminal/timeout");
    expect(mutate(r => { r.metrics!.useful = NaN; })).toThrow("Non-finite");
    expect(mutate(r => { r.stateHash = "truncated"; })).toThrow("terminal hash");
  });
  it("does not mistake an earlier loss for a faster successful run", () => {
    const paired = pairComparisons(labeled("baseline"), labeled("three-hit"), false);
    paired[0].baseline.status = "won"; paired[0].experiment.status = "lost"; paired[0].experiment.duration = 1;
    const stats = comparisonStats([paired[0]]);
    expect(stats.wonToLost).toBe(1); expect(stats.bothWin).toBe(0); expect(stats.meanMinuteDeltaBothWin).toBeNull();
  });
});
