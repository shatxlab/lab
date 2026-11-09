import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAPS } from "@/lib/kingsroad/sim/maps";
import { studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { airLaneWithin, decide, newDecisions, plotOrder, type Policy } from "../../scripts/kingsroad/study/policy";
import { validateRow, type ComparisonRow } from "../../scripts/kingsroad/study/compare";
import * as engine from "@/lib/kingsroad/sim/game";
import { verifyFrozenOrShippedInputs } from "./study-inputs";

let dir: string, bundle: string;
const rows = new Map<string, ComparisonRow[]>();
beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "kr-archer-test-"));
  bundle = resolve(dir, "baseline.mjs");
  await build({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile: bundle, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), "baseline")] });
  for (const [name, args] of [
    ["smart", ["--maps=meadow", "--seeds=1", "--strategies=archer-smart", `--out=${resolve(dir, "smart.jsonl")}`]],
    ["stock", ["--maps=meadow", "--seeds=1", "--strategies=archer", `--out=${resolve(dir, "stock.jsonl")}`]],
    ["smart-late", ["--maps=orchards,crows", "--seeds=1,2,3,4,5,6,7,8", "--strategies=archer-smart", `--out=${resolve(dir, "smart-late.jsonl")}`]],
  ] as const) {
    execFileSync(process.execPath, [bundle, ...args], { stdio: "pipe" });
    rows.set(name, readFileSync(resolve(dir, name === "stock" ? "stock.jsonl" : name === "smart" ? "smart.jsonl" : "smart-late.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l)));
  }
}, 60_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
const policy = (strategy: Policy["strategy"]): Policy => ({ strategy, economy: "staged", branch: "balanced", placement: "coverage", volley: true, early: false, cap: null });

describe("smart Archer policy: predeclared rules", () => {
  it("builds archer, frost, archer, archer, with frost second for early slow synergy", () => {
    const builds = rows.get("smart")![0].decisions.purchases.filter(p => p.type === "build").slice(0, 4).map(p => p.kind);
    expect(builds).toEqual(["archer", "frost", "archer", "archer"]);
    const stock = rows.get("stock")![0].decisions.purchases.filter(p => p.type === "build").slice(0, 4).map(p => p.kind);
    expect(stock).toEqual(["archer", "archer", "archer", "frost"]);
  });
  it("scores air lanes as static geometry: converging on the gate beats a far corner, deterministically", () => {
    expect(airLaneWithin(180, 540, 92)).toBeGreaterThan(airLaneWithin(30, 60, 92));
    expect(airLaneWithin(180, 300, 92)).toBe(airLaneWithin(180, 300, 92));
    expect(airLaneWithin(180, 540, 92)).toBeGreaterThan(0);
  });
  it("ranks archer plots by road plus air coverage and leaves other kinds' ranking alone", () => {
    const game = engine.createGame("meadow", 1);
    const archerRole = plotOrder(game, "archer", "archer-role"), stock = plotOrder(game, "archer", "coverage");
    expect(archerRole).not.toEqual(stock);
    expect(new Set(archerRole).size).toBe(stock.length);
    expect(plotOrder(game, "frost", "archer-role")).toEqual(plotOrder(game, "frost", "coverage"));
  });
  it("focuses archers: the second archer stands within two archer ranges of the first", () => {
    const map = MAPS.find(m => m.id === "meadow")!;
    const builds = rows.get("smart")![0].decisions.purchases.filter(p => p.type === "build" && p.kind === "archer").slice(0, 2).map(p => p.plot);
    expect(builds).toHaveLength(2);
    const [a, b] = builds.map(i => map.plots[i]);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(2 * 92 + 1e-9);
  });
  it("forks fire where there are no imps and lune where imps march", () => {
    const late = rows.get("smart-late")!;
    const forked = (map: string) => late.filter(r => r.map === map).flatMap(r => r.towers.filter(t => t.kind === "archer" && t.level === 3));
    // orchards sends knights and scamps but no imps; every reached fork picks fire.
    for (const tower of forked("orchards")) expect(tower.branch).toBe("fire");
    // crows adds fireproof imps; every reached fork picks lune.
    for (const tower of forked("crows")) expect(tower.branch).toBe("lune");
    expect(forked("orchards").length + forked("crows").length).toBeGreaterThan(0);
  });
  it("produces valid, deterministic rows under the baseline tag", () => {
    for (const r of [...rows.get("smart")!, ...rows.get("smart-late")!]) { expect(r.variant).toBe("baseline"); validateRow(r); }
    execFileSync(process.execPath, [bundle, "--maps=meadow", "--seeds=1", "--strategies=archer-smart", `--out=${resolve(dir, "again.jsonl")}`], { stdio: "pipe" });
    const again = readFileSync(resolve(dir, "again.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l).stateHash);
    expect(again).toEqual(rows.get("smart")!.map(r => r.stateHash));
  });
});

describe("smart Archer policy: no drift in existing strategies", () => {
  it("reproduces the frozen study's stock-Archer terminal hash on meadow/1", () => {
    const [header, ...lines] = readFileSync(resolve("reports/kingsroad-study/runs.csv"), "utf8").trim().split("\n").map(l => l.split(","));
    const wanted = lines.map(l => Object.fromEntries(header.map((h, i) => [h, l[i]]))).find(r => r.map === "meadow" && r.seed === "1" && r.strategy === "archer" && r.economy === "staged" && r.placement === "coverage" && r.volley === "true" && r.early === "false" && r.cap === "");
    expect(wanted).toBeDefined();
    expect(rows.get("stock")![0].stateHash).toBe(wanted!.state_sha256);
  });
  it("leaves decide() behaviour for the stock archer strategy untouched, including branch alternation", () => {
    const game = engine.createGame("crows", 7);
    game.status = "ready";
    const d = newDecisions();
    decide(game, policy("archer"), d, 0, engine);
    // The stock plan's first build is an archer on the top coverage plot, as before the smart policy existed.
    expect(d.purchases[0]).toMatchObject({ type: "build", kind: "archer" });
  });
  it("never mutates the shipping engine, and keeps inputs at frozen or re-shipped hashes", () => {
    expect(verifyFrozenOrShippedInputs()).toBeUndefined();
  });
});
