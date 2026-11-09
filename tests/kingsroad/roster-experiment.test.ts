import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { SPREAD_KINDS, isVariant, variantBalanceSource, variantRosterSource, variantSource, variantWavesSource, type Variant } from "../../scripts/kingsroad/study/variant";
import { validateRow, type ComparisonRow } from "../../scripts/kingsroad/study/compare";

type Spawn = { kind: string; at: number; road: number };
type Probe = { map: string; roads: number; waves: { wave: number; spawns: Spawn[] }[] };
const ARMS = ["baseline", "roster-spread"] as const;

let dir: string;
const probes = new Map<Variant, Probe[]>(), bundles = new Map<Variant, string>();
const rows = new Map<Variant, ComparisonRow[]>();
beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "kr-roster-test-"));
  for (const variant of ARMS) {
    const outfile = resolve(dir, `${variant}.mjs`);
    await build({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    bundles.set(variant, outfile);
    const out = resolve(dir, `${variant}.jsonl`);
    execFileSync(process.execPath, [outfile, "--maps=meadow,crossroads", "--seeds=1", "--strategies=ballista,archer,mixed", `--out=${out}`], { stdio: "pipe" });
    rows.set(variant, readFileSync(out, "utf8").trim().split("\n").map(l => JSON.parse(l)));
    const entry = resolve(dir, `probe-${variant}.ts`), probeOut = resolve(dir, `probe-${variant}.mjs`);
    writeFileSync(entry, [
      `import { MAPS } from ${JSON.stringify(resolve("src/lib/kingsroad/sim/maps.ts"))};`,
      `import { buildSpawns } from ${JSON.stringify(resolve("src/lib/kingsroad/sim/waves.ts"))};`,
      `const out = MAPS.map(map => ({ map: map.id, roads: map.roads.length, waves: Array.from({ length: map.waves }, (_, i) => i + 1).map(wave => ({`,
      `  wave, spawns: buildSpawns(wave, map, { rng: 1000 + wave * 37 + map.waves * 101 }) })) }));`,
      `console.log(JSON.stringify(out));`,
    ].join("\n"));
    await build({ entryPoints: [entry], outfile: probeOut, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    probes.set(variant, JSON.parse(execFileSync(process.execPath, [probeOut], { encoding: "utf8" })));
  }
}, 60_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
const isSpread = (kind: string) => (SPREAD_KINDS as readonly string[]).includes(kind);

describe("roster-spread: predeclared source change", () => {
  it("splits only scamp and runner columns across roads, changing nothing else in any variant's source", () => {
    expect(isVariant("roster-spread")).toBe(true);
    expect(SPREAD_KINDS).toEqual(["scamp", "runner"]);
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    const anchor = anchorText();
    let changed: string = "";
    expect(waves.split(anchor)).toHaveLength(2);
    changed = variantRosterSource(waves, "roster-spread");
    expect(changed).toBe(waves.replace(anchor, `      spawns.push({ kind, at, road: ["scamp", "runner"].includes(kind) ? (road + count) % map.roads.length : road });\n`));
    for (const v of ["baseline", "three-hit", "range-80", "cadence-2x", "matched-2x", "density-only"] as const) {
      expect(variantRosterSource(waves, v)).toBe(waves);
      // No spacing arm smuggles in the roster change; the roster arm is the only one that adds it.
      expect(variantWavesSource(waves, v)).not.toContain("(road + count) % map.roads.length");
    }
    expect(changed).toContain("(road + count) % map.roads.length");
    // The roster arm touches neither the game nor the balance source.
    const game = readFileSync(resolve("src/lib/kingsroad/sim/game.ts"), "utf8");
    const balance = readFileSync(resolve("src/lib/kingsroad/sim/balance.ts"), "utf8");
    expect(variantSource(game, "roster-spread")).toBe(game);
    expect(variantBalanceSource(balance, "roster-spread")).toBe(balance);
  });
  it("adds no random draws and fails closed on a missing or duplicated anchor", () => {
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    const changed = variantRosterSource(waves, "roster-spread");
    expect(changed.split("random(").length).toBe(waves.split("random(").length);
    expect(() => variantRosterSource("", "roster-spread")).toThrow("exactly once");
    const a = anchorText();
    expect(() => variantRosterSource(waves.replace(a, a + a), "roster-spread")).toThrow("exactly once");
    expect(() => variantRosterSource(waves, "roster-wide" as Variant)).toThrow("Unknown");
  });
});
const anchorText = () => "      spawns.push({ kind, at, road });\n";

describe("roster-spread: executed schedules", () => {
  it("keeps every spawn's kind and time on every map and wave, and every non-spread kind's road", () => {
    const base = probes.get("baseline")!, spread = probes.get("roster-spread")!;
    expect(spread.map(p => p.map)).toEqual(base.map(p => p.map));
    for (let m = 0; m < base.length; m++) for (let w = 0; w < base[m].waves.length; w++) {
      const a = base[m].waves[w].spawns, b = spread[m].waves[w].spawns;
      expect(b.map(s => `${s.kind}@${s.at}`)).toEqual(a.map(s => `${s.kind}@${s.at}`));
      for (let i = 0; i < a.length; i++) if (!isSpread(a[i].kind)) expect(b[i].road).toBe(a[i].road);
    }
  });
  it("round-robins the spread kinds on multi-road maps and leaves single-road maps untouched", () => {
    const base = probes.get("baseline")!, spread = probes.get("roster-spread")!;
    let changedColumns = 0, singleRoadMaps = 0;
    for (let m = 0; m < base.length; m++) {
      const roads = base[m].roads;
      if (roads === 1) singleRoadMaps++;
      for (const wave of base[m].waves) {
        for (const kind of SPREAD_KINDS) {
          const a = wave.spawns.filter(s => s.kind === kind), b = spread[m].waves.find(w => w.wave === wave.wave)!.spawns.filter(s => s.kind === kind);
          if (a.length < 2) continue;
          if (roads === 1) { expect(b.map(s => s.road)).toEqual(a.map(s => s.road)); continue; }
          expect(a.every(s => s.road === a[0].road)).toBe(true);
          expect(b.map(s => s.road)).toEqual(a.map((_, i) => (a[0].road + i) % roads));
          expect(new Set(b.map(s => s.road)).size).toBeGreaterThan(1);
          changedColumns++;
        }
      }
    }
    expect(changedColumns).toBeGreaterThan(20);
    expect(singleRoadMaps).toBe(8);
  });
  it("keeps single-road meadow bit-identical and actually changes multi-road crossroads", () => {
    for (let i = 0; i < rows.get("baseline")!.length; i++) {
      const a = rows.get("baseline")![i], b = rows.get("roster-spread")![i];
      expect(b.variant).toBe("roster-spread");
      validateRow(b);
      if (a.map === "meadow") {
        expect(b.stateHash).toBe(a.stateHash);
        expect(b.decisions).toEqual(a.decisions);
      } else {
        expect(b.stateHash).not.toBe(a.stateHash);
      }
    }
  });
  it("passes the engine self-test under the spread build", () => {
    const test = JSON.parse(execFileSync(process.execPath, [bundles.get("roster-spread")!, "--self-test"], { encoding: "utf8" }));
    expect(test.variant).toBe("roster-spread");
    expect(test.suffixes).toBeGreaterThan(0);
  }, 30_000);
});
