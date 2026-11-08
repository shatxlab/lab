import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { plannedComparisons, pairComparisons, validateRow, type ComparisonRow, type LabeledRow } from "../../scripts/kingsroad/study/compare";
import { CADENCE_KINDS, STOCK_CADENCE, isVariant, variantBalanceSource, variantSource, variantWavesSource, type Variant } from "../../scripts/kingsroad/study/variant";

let dir: string;
const bundles = new Map<Variant, string>(), rows = new Map<Variant, ComparisonRow[]>();
type Probe = { map: string; waves: { wave: number; roster: Record<string, number>; spawns: { kind: string; at: number; road: number }[] }[] };
const probes = new Map<Variant, Probe[]>();

beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "kr-cadence-test-"));
  for (const variant of ["baseline", "cadence-2x"] as const) {
    const outfile = resolve(dir, `${variant}.mjs`), out = resolve(dir, `${variant}.jsonl`);
    await build({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    bundles.set(variant, outfile);
    execFileSync(process.execPath, [outfile, "--maps=meadow", "--seeds=1", "--strategies=ballista,archer,mixed", `--out=${out}`], { stdio: "pipe" });
    rows.set(variant, readFileSync(out, "utf8").trim().split("\n").map(line => JSON.parse(line)));
    // Probe the real waves module, bundled with the same in-memory hook, over every map and wave.
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
}, 60_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
const labeled = (variant: Variant): LabeledRow[] => rows.get(variant)!.map(row => ({ matrix: "primary", row: structuredClone(row) }));

/** Within one column the spacing is the only gap between two of a kind, so consecutive same-kind gaps reveal it. */
function columnGaps(spawns: Probe["waves"][number]["spawns"], kind: string): number[] {
  const at = spawns.filter(s => s.kind === kind).map(s => s.at);
  return at.slice(1).map((value, i) => Math.round((value - at[i]) * 1e6) / 1e6);
}

describe("cadence diagnostic: predeclared arm", () => {
  it("is registered as a study variant that changes only spawn spacing, never the shipping sources", () => {
    expect(isVariant("cadence-2x")).toBe(true);
    expect(CADENCE_KINDS).toEqual(["runner", "bat", "scamp"]);
    expect(STOCK_CADENCE).toEqual({ runner: 0.55, bat: 0.45, scamp: 0.2 });
    const game = readFileSync(resolve("src/lib/kingsroad/sim/game.ts"), "utf8");
    const balance = readFileSync(resolve("src/lib/kingsroad/sim/balance.ts"), "utf8");
    expect(variantSource(game, "cadence-2x")).toBe(game);
    expect(variantBalanceSource(balance, "cadence-2x")).toBe(balance);
  });
  it("doubles exactly the runner, bat and scamp spacing literals in the in-memory waves table", () => {
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    expect(variantWavesSource(waves, "baseline")).toBe(waves);
    expect(variantWavesSource(waves, "three-hit")).toBe(waves);
    expect(variantWavesSource(waves, "range-80")).toBe(waves);
    const changed = variantWavesSource(waves, "cadence-2x");
    expect(changed).toBe(waves.replace("  runner: 0.55,", "  runner: 1.1,").replace("  bat: 0.45,", "  bat: 0.9,").replace("  scamp: 0.2,", "  scamp: 0.4,"));
    expect(changed.split("\n").length).toBe(waves.split("\n").length);
  });
  it("fails closed on a missing, duplicated or re-tuned spacing table", () => {
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    expect(() => variantWavesSource("", "cadence-2x")).toThrow("exactly once");
    expect(() => variantWavesSource(waves + "const SPACING: Record<FoeKind, number> = {\n", "cadence-2x")).toThrow("exactly once");
    expect(() => variantWavesSource(waves.replace("  runner: 0.55,", "  runner: 0.6,"), "cadence-2x")).toThrow("stock runner spacing");
    expect(() => variantWavesSource(waves, "cadence-3x" as Variant)).toThrow("Unknown");
  });
  it("keeps every shipping input byte-identical to the frozen study baseline", () => {
    const manifest = JSON.parse(readFileSync(resolve("reports/kingsroad-study/manifest.json"), "utf8"));
    for (const [path, hash] of Object.entries(manifest.inputs)) expect(createHash("sha256").update(readFileSync(resolve(path))).digest("hex")).toBe(hash);
  });
});

describe("cadence changes arrival spacing only", () => {
  it("keeps every wave's roster, per-kind road order and HP, moving only fast-kind gaps by exactly 2x", () => {
    const base = probes.get("baseline")!, cad = probes.get("cadence-2x")!;
    expect(cad.map(m => m.map)).toEqual(base.map(m => m.map));
    let checkedFastGaps = 0, checkedSlowGaps = 0;
    for (let m = 0; m < base.length; m++) for (let w = 0; w < base[m].waves.length; w++) {
      const a = base[m].waves[w], b = cad[m].waves[w];
      expect(b.roster).toEqual(a.roster);
      for (const kind of ["grunt", "runner", "brute", "bat", "knight", "imp", "scamp", "gargoyle"]) {
        const ra = a.spawns.filter(s => s.kind === kind).map(s => s.road), rb = b.spawns.filter(s => s.kind === kind).map(s => s.road);
        expect(rb).toEqual(ra);
        const ga = columnGaps(a.spawns, kind), gb = columnGaps(b.spawns, kind);
        expect(gb.length).toBe(ga.length);
        const factor = (CADENCE_KINDS as readonly string[]).includes(kind) ? 2 : 1;
        for (let i = 0; i < ga.length; i++) expect(gb[i]).toBeCloseTo(ga[i] * factor, 5);
        if (factor === 2) checkedFastGaps += ga.length; else checkedSlowGaps += ga.length;
      }
      // Healers and the warlord are timed off the column, so only their presence and count are fixed.
      expect(b.spawns.filter(s => s.kind === "boss").length).toBe(a.spawns.filter(s => s.kind === "boss").length);
      expect(b.spawns.filter(s => s.kind === "healer").length).toBe(a.spawns.filter(s => s.kind === "healer").length);
    }
    expect(checkedFastGaps).toBeGreaterThan(100);
    expect(checkedSlowGaps).toBeGreaterThan(100);
    const stock = base.flatMap(m => m.waves).flatMap(w => columnGaps(w.spawns, "runner"));
    expect(Math.min(...stock)).toBeCloseTo(0.55, 5);
  });
  it("runs the real game under the cadence arm, tagged and labelled with stock ranges and terminal states that change", () => {
    const base = rows.get("baseline")!, cad = rows.get("cadence-2x")!;
    for (const row of cad) { expect(row.variant).toBe("cadence-2x"); expect(row.ballistaRanges).toEqual([140, 150, 165]); validateRow(row); }
    for (const strategy of ["ballista", "archer", "mixed"] as const) {
      const a = base.find(r => r.policy.strategy === strategy)!, b = cad.find(r => r.policy.strategy === strategy)!;
      expect(b.stateHash).not.toBe(a.stateHash);
    }
    const test = JSON.parse(execFileSync(process.execPath, [bundles.get("cadence-2x")!, "--self-test"], { encoding: "utf8" }));
    expect(test.variant).toBe("cadence-2x"); expect(test.range.ranges).toEqual([140, 150, 165]); expect(test.piercing.simultaneousFixtures).toBe(30);
  }, 30_000);
  it("uses the same design as the three-hit diagnostic and never adds a placement control", () => {
    const plan = plannedComparisons("cadence-2x");
    expect(plan).toHaveLength(1152);
    expect(plan.some(p => p.matrix === "fixed-placement")).toBe(false);
    expect(new Set(plan.map(r => JSON.stringify(r))).size).toBe(1152);
  });
  it("requires an explicitly selected cadence arm and allows archer-only pairs to change, unlike the Ballista-only variants", () => {
    expect(() => pairComparisons(labeled("baseline"), labeled("cadence-2x"), false)).toThrow("Wrong arm");
    const pairs = pairComparisons(labeled("baseline"), labeled("cadence-2x"), false, "cadence-2x");
    expect(pairs).toHaveLength(3);
    const archer = pairs.find(p => p.baseline.policy.strategy === "archer")!;
    expect(archer.baseline.stateHash).not.toBe(archer.experiment.stateHash);
  });
  it("still rejects a cadence-tagged row whose ranges were altered", () => {
    const r = structuredClone(rows.get("cadence-2x")![0]); r.ballistaRanges = [112, 120, 132];
    expect(() => validateRow(r)).toThrow("range metadata mismatch");
  });
});
