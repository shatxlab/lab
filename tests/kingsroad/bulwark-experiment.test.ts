import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAPS } from "@/lib/kingsroad/sim/maps";
import { studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { BULWARK, isVariant, variantBulwarkBalanceSource, variantBulwarkWavesSource, variantRosterSource, variantSource, variantTypesSource, variantWavesSource, type Variant } from "../../scripts/kingsroad/study/variant";

let dir: string;
const bundles = new Map<Variant, string>();
const rows = new Map<Variant, Record<string, unknown>[]>();
type Probe = { map: string; waves: { wave: number; roster: Record<string, number>; spawns: { kind: string; at: number }[] }[] };
const probes = new Map<Variant, Probe[]>();
beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "kr-bulwark-test-"));
  for (const variant of ["baseline", "bulwark"] as const) {
    const outfile = resolve(dir, `${variant}.mjs`);
    await build({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });
    bundles.set(variant, outfile);
    const out = resolve(dir, `${variant}.jsonl`);
    execFileSync(process.execPath, [outfile, "--maps=meadow", "--seeds=1", "--strategies=ballista,archer,mixed,archer-smart", `--out=${out}`], { stdio: "pipe" });
    rows.set(variant, readFileSync(out, "utf8").trim().split("\n").map(l => JSON.parse(l)));
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

describe("bulwark: predeclared source changes", () => {
  it("registers the variant and changes exactly four files, fail-closed, leaving other variants' sources alone", () => {
    expect(isVariant("bulwark")).toBe(true);
    expect(BULWARK).toMatchObject({ hp: 90, speed: 26, leak: 2, gold: 14, hitCap: 12, fromWave: 8, every: 6, spacing: 1.6 });
    const types = readFileSync(resolve("src/lib/kingsroad/sim/types.ts"), "utf8");
    const balance = readFileSync(resolve("src/lib/kingsroad/sim/balance.ts"), "utf8");
    const game = readFileSync(resolve("src/lib/kingsroad/sim/game.ts"), "utf8");
    const waves = readFileSync(resolve("src/lib/kingsroad/sim/waves.ts"), "utf8");
    expect(variantTypesSource(types, "bulwark")).toContain('"bulwark"');
    expect(variantBulwarkBalanceSource(balance, "bulwark")).toContain("bulwark: foe(");
    expect(variantSource(game, "bulwark")).toContain("def.hitCap ?? Infinity");
    expect(variantBulwarkWavesSource(waves, "bulwark")).toContain(`bulwark: wave >= ${BULWARK.fromWave}`);
    for (const v of ["baseline", "three-hit", "range-80", "cadence-2x", "matched-2x", "density-only", "roster-spread"] as const) {
      expect(variantTypesSource(types, v)).toBe(types);
      expect(variantBulwarkBalanceSource(balance, v)).toBe(balance);
      expect(variantBulwarkWavesSource(waves, v)).toBe(waves);
      if (v !== "three-hit") expect(variantSource(game, v)).toBe(game);
    }
    expect(() => variantTypesSource(types.replace("export type NewFoeKind", "export type OldFoeKind"), "bulwark")).toThrow("exactly once");
    expect(() => variantBulwarkBalanceSource(balance.replace('  fireproof: boolean;\n', ""), "bulwark")).toThrow("exactly once");
    expect(() => variantSource(game.replace("const raw = fire", "const cooked = fire"), "bulwark")).toThrow("exactly once");
    expect(() => variantBulwarkWavesSource(waves.replace("  gargoyle: 1.2,\n", ""), "bulwark")).toThrow("exactly once");
  });
});

describe("bulwark: executed schedules and runs", () => {
  it("adds the predeclared bulwark counts on every map from wave 6 without touching other kinds' rosters", () => {
    const base = probes.get("baseline")!, bul = probes.get("bulwark")!;
    let bulwarks = 0, checkedGaps = 0;
    for (let m = 0; m < base.length; m++) for (let w = 0; w < base[m].waves.length; w++) {
      const a = base[m].waves[w], b = bul[m].waves[w];
      for (const kind of ["grunt", "runner", "brute", "bat", "knight", "imp", "healer", "scamp", "gargoyle", "boss"]) expect(b.roster[kind]).toBe(a.roster[kind]);
      const expected = a.wave >= BULWARK.fromWave ? 1 + Math.floor((a.wave - BULWARK.fromWave) / BULWARK.every) : 0;
      expect(b.roster.bulwark).toBe(expected);
      expect(b.spawns.filter(s => s.kind === "bulwark").length).toBe(expected);
      bulwarks += expected;
      const at = b.spawns.filter(s => s.kind === "bulwark").map(s => s.at);
      for (let i = 1; i < at.length; i++) { expect(at[i] - at[i - 1]).toBeCloseTo(BULWARK.spacing, 5); checkedGaps++; }
      expect(b.spawns.length).toBe(a.spawns.length + expected);
    }
    expect(bulwarks).toBeGreaterThan(200);
    expect(checkedGaps).toBeGreaterThan(150);
    // Forcing ignores the map's foe list: even foes-free maps 1-10 send bulwarks.
    const meadow = bul.find(p => p.map === "meadow")!;
    expect(MAPS.find(m => m.id === "meadow")!.foes).toHaveLength(0);
    expect(meadow.waves[BULWARK.fromWave - 1].roster.bulwark).toBe(1);
    expect(meadow.waves[BULWARK.fromWave - 2].roster.bulwark).toBe(0);
  });
  it("proves the cap in the engine self-test and keeps the baseline arm free of bulwarks", () => {
    const bul = JSON.parse(execFileSync(process.execPath, [bundles.get("bulwark")!, "--self-test"], { encoding: "utf8" }));
    expect(bul.variant).toBe("bulwark");
    expect(bul.bulwark).toEqual({ hitCap: 12, boltCappedTo: 12, gruntFullDamage: 95, underCapShotKept: true });
    expect(bul.piercing.kinds).toContain("bulwark");
    const base = JSON.parse(execFileSync(process.execPath, [bundles.get("baseline")!, "--self-test"], { encoding: "utf8" }));
    expect(base.bulwark).toBeNull();
    expect(base.piercing.kinds).not.toContain("bulwark");
  }, 30_000);
  it("runs all four strategies with reconciled ledgers, bulwark kills recorded, and changed terminal states", () => {
    const bul = rows.get("bulwark")!;
    expect(bul).toHaveLength(4);
    for (const row of bul) {
      expect(row.variant).toBe("bulwark");
      const m = row.metrics as unknown as { kills: Record<string, number>; spawnedHp: number; healed: number; useful: number; leakedHp: number; livingHp: number };
      expect(m.kills.bulwark ?? 0).toBeGreaterThan(0);
      const hpError = m.spawnedHp + m.healed - m.useful - m.leakedHp - m.livingHp;
      expect(Math.abs(hpError)).toBeLessThanOrEqual(Math.max(0.0001, m.spawnedHp * 1e-8));
      const gold = (MAPS.find(map => map.id === row.map)!.startGold as number) + (row.decisions as { earlyGold: number }).earlyGold - (row.spent as number)
        + Object.entries(m.kills).reduce((sum, [kind, n]) => sum + (kind === "bulwark" ? BULWARK.gold : ({ grunt: 5, runner: 5, brute: 14, bat: 7, boss: 120, knight: 14, imp: 8, healer: 12, scamp: 2, gargoyle: 16 } as Record<string, number>)[kind]!) * n, 0);
      expect(row.gold).toBe(gold);
      const stock = rows.get("baseline")![bul.indexOf(row)];
      expect((stock as { map: string }).map).toBe(row.map);
      expect(stock.stateHash).not.toBe(row.stateHash);
    }
  });
});
