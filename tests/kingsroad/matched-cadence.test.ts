import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { pairComparisons, plannedComparisons, validateRow, type ComparisonRow, type LabeledRow } from "../../scripts/kingsroad/study/compare";
import { isSpacingArm, isVariant, variantWavesSource, type Variant } from "../../scripts/kingsroad/study/variant";

type Spawn = { kind: string; at: number; road: number };
type Probe = { map: string; waves: { wave: number; roster: Record<string, number>; spawns: Spawn[] }[] };
const SLOW_STOCK: Record<string, number> = { grunt: 0.75, brute: 1.8, knight: 1.2, imp: 0.8, gargoyle: 1.2, bulwark: 1.6 };
const FAST_STOCK: Record<string, number> = { runner: 0.55, bat: 0.45, scamp: 0.2 };
const ARMS = ["baseline", "matched-2x", "density-only"] as const;

let dir: string;
const probes = new Map<Variant, Probe[]>(), rows = new Map<Variant, ComparisonRow[]>(), bundles = new Map<Variant, string>();
beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "kr-matched-test-"));
  for (const variant of ARMS) {
    const outfile = resolve(dir, `${variant}.mjs`), out = resolve(dir, `${variant}.jsonl`);
    await build({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    bundles.set(variant, outfile);
    execFileSync(process.execPath, [outfile, "--maps=meadow,watch", "--seeds=1", "--strategies=ballista,archer,mixed", `--out=${out}`], { stdio: "pipe" });
    rows.set(variant, readFileSync(out, "utf8").trim().split("\n").map(line => JSON.parse(line)));
    const entry = resolve(dir, `probe-${variant}.ts`), probeOut = resolve(dir, `probe-${variant}.mjs`);
    writeFileSync(entry, [
      `import { MAPS } from ${JSON.stringify(resolve("src/lib/kingsroad/sim/maps.ts"))};`,
      `import { buildSpawns, waveRoster } from ${JSON.stringify(resolve("src/lib/kingsroad/sim/waves.ts"))};`,
      `const out = MAPS.map(map => ({ map: map.id, waves: Array.from({ length: map.waves }, (_, i) => i + 1).map(wave => ({`,
      `  wave, roster: { ...waveRoster(wave, map) }, spawns: buildSpawns(wave, map, { rng: 1000 + wave * 37 + map.waves * 101 }) })) }));`,
      `console.log(JSON.stringify(out));`,
    ].join("\n"));
    await build({ entryPoints: [entry], outfile: probeOut, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    probes.set(variant, JSON.parse(execFileSync(process.execPath, [probeOut], { encoding: "utf8" })));
  }
}, 90_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const span = (spawns: Spawn[]) => Math.max(...spawns.map(s => s.at));
const gaps = (spawns: Spawn[], kind: string) => { const at = spawns.filter(s => s.kind === kind).map(s => s.at); return at.slice(1).map((v, i) => v - at[i]); };
/** Stock fast time and stock slow time for one wave, from its roster. */
function stockSplit(roster: Record<string, number>) {
  const fast = Object.entries(FAST_STOCK).reduce((s, [k, v]) => s + (roster[k] ?? 0) * v, 0);
  const slow = Object.entries(SLOW_STOCK).reduce((s, [k, v]) => s + (roster[k] ?? 0) * v, 0);
  return { fast, slow };
}
/** The last column's kind is the kind of the wave's last non-warlord, non-healer spawn in stock time. */
function lastKind(spawns: Spawn[]): string {
  const cols = spawns.filter(s => s.kind !== "boss" && s.kind !== "healer");
  return cols.reduce((a, b) => (b.at > a.at ? b : a)).kind;
}
/** The matched-2x factor, derived from the stock spacings of the last column. */
function matchedFactor(roster: Record<string, number>, last: string): number {
  const { fast, slow } = stockSplit(roster);
  if (FAST_STOCK[last] !== undefined) return 1 + (FAST_STOCK[last] - fast) / slow;
  return 1 - fast / (slow - SLOW_STOCK[last]);
}

describe("matched and density arms: predeclared rules", () => {
  it("registers both arms as spacing-only variants and leaves the other variants' schedules alone", () => {
    expect(isVariant("matched-2x")).toBe(true); expect(isVariant("density-only")).toBe(true);
    expect(isSpacingArm("matched-2x")).toBe(true); expect(isSpacingArm("density-only")).toBe(true); expect(isSpacingArm("three-hit")).toBe(false);
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    for (const v of ["baseline", "three-hit", "range-80"] as const) expect(variantWavesSource(waves, v)).toBe(waves);
  });
  it("doubles only the fast literals in matched-2x, and only scales the slow loop in density-only", () => {
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    const matched = variantWavesSource(waves, "matched-2x");
    expect(matched).toContain("  runner: 1.1,"); expect(matched).toContain("  bat: 0.9,"); expect(matched).toContain("  scamp: 0.4,");
    expect(matched).toContain("  grunt: 0.75,"); expect(matched).toContain("STUDY_STOCK_FAST");
    const density = variantWavesSource(waves, "density-only");
    expect(density).toContain("  runner: 0.55,"); expect(density).toContain("  scamp: 0.2,");
    expect(density).toContain("STUDY_STOCK_FAST");
    expect(density).not.toBe(waves);
  });
  it("fails closed on a missing loop or spacing anchor", () => {
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    expect(() => variantWavesSource(waves.replace("  let at = 0;\n", ""), "density-only")).toThrow("must occur exactly once");
    expect(() => variantWavesSource(waves.replace("      at += SPACING[kind];\n", ""), "matched-2x")).toThrow("must occur exactly once");
  });
  it("is the same 1,152-pair design, with no placement control and Ballista-only identity checks dropped", () => {
    expect(plannedComparisons("matched-2x")).toHaveLength(1152);
    expect(plannedComparisons("density-only")).toHaveLength(1152);
    const a = rows.get("baseline")!.map(r => ({ matrix: "primary", row: structuredClone(r) })) as LabeledRow[];
    const b = rows.get("matched-2x")!.map(r => ({ matrix: "primary", row: structuredClone(r) })) as LabeledRow[];
    expect(pairComparisons(a, b, false, "matched-2x")).toHaveLength(6);
  });
});

describe("matched and density arms: executed wave timing", () => {
  it("keeps every wave's stream length equal to stock in matched-2x, on every map and wave", () => {
    const base = probes.get("baseline")!, m = probes.get("matched-2x")!;
    let waves = 0;
    for (let i = 0; i < base.length; i++) for (let w = 0; w < base[i].waves.length; w++) {
      const a = base[i].waves[w], b = m[i].waves[w];
      expect(span(b.spawns)).toBeCloseTo(span(a.spawns), 6);
      waves++;
    }
    expect(waves).toBeGreaterThan(300);
  });
  it("shortens each wave by the fast stock time, less the last column's own fast spacing, in density-only", () => {
    const base = probes.get("baseline")!, d = probes.get("density-only")!;
    let shorter = 0;
    for (let i = 0; i < base.length; i++) for (let w = 0; w < base[i].waves.length; w++) {
      const a = base[i].waves[w], b = d[i].waves[w];
      const last = lastKind(a.spawns);
      const expected = stockSplit(a.roster).fast - (FAST_STOCK[last] ?? 0);
      if (a.spawns.some(s => s.kind === "boss")) expect(span(b.spawns)).toBeCloseTo(span(a.spawns), 6);
      else expect(span(a.spawns) - span(b.spawns)).toBeCloseTo(expected, 6);
      if (expected > 0) shorter++;
    }
    expect(shorter).toBeGreaterThan(100);
  });
  it("doubles fast gaps and shrinks slow gaps by the same per-wave factor, solved for the last column, with the same roads and counts", () => {
    const base = probes.get("baseline")!, m = probes.get("matched-2x")!;
    let checkedFast = 0, checkedSlow = 0;
    for (let i = 0; i < base.length; i++) for (let w = 0; w < base[i].waves.length; w++) {
      const a = base[i].waves[w], b = m[i].waves[w];
      expect(b.roster).toEqual(a.roster);
      const factor = matchedFactor(a.roster, lastKind(a.spawns));
      expect(factor).toBeGreaterThanOrEqual(0.3); expect(factor).toBeLessThanOrEqual(1.5);
      for (const kind of [...Object.keys(FAST_STOCK), ...Object.keys(SLOW_STOCK)]) {
        expect(b.spawns.filter(s => s.kind === kind).map(s => s.road)).toEqual(a.spawns.filter(s => s.kind === kind).map(s => s.road));
        const ga = gaps(a.spawns, kind), gb = gaps(b.spawns, kind);
        expect(gb.length).toBe(ga.length);
        const ratio = FAST_STOCK[kind] !== undefined ? 2 : factor;
        for (let g = 0; g < ga.length; g++) expect(gb[g]).toBeCloseTo(ga[g] * ratio, 5);
        if (FAST_STOCK[kind] !== undefined) checkedFast += ga.length; else checkedSlow += ga.length;
      }
    }
    expect(checkedFast).toBeGreaterThan(100); expect(checkedSlow).toBeGreaterThan(100);
  });
  it("runs the real game in both arms, tagged and labelled, with states that differ from stock", () => {
    for (const variant of ["matched-2x", "density-only"] as const) {
      for (const row of rows.get(variant)!) { expect(row.variant).toBe(variant); expect(row.ballistaRanges).toEqual([140, 150, 165]); validateRow(row); }
      for (const strategy of ["ballista", "archer", "mixed"] as const) {
        const a = rows.get("baseline")!.find(r => r.policy.strategy === strategy && r.map === "meadow")!;
        const b = rows.get(variant)!.find(r => r.policy.strategy === strategy && r.map === "meadow")!;
        expect(b.stateHash).not.toBe(a.stateHash);
      }
    }
  });
});
