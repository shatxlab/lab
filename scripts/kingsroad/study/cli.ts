import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MAPS } from "../../../src/lib/kingsroad/sim/maps";
import { play, pacingProbes, selfTest, type Options } from "./runner";
import type { Policy, Strategy } from "./policy";

const args = new Map(process.argv.slice(2).map(arg => { const [key, ...value] = arg.split("="); return [key, value.join("=") || "true"]; }));
const allowed = ["--self-test", "--maps", "--seeds", "--strategies", "--economy", "--branch", "--placement", "--no-volley", "--early", "--cap", "--pacing", "--phases", "--out"];
for (const key of args.keys()) if (!allowed.includes(key)) throw new Error(`Unknown option ${key}`);
if (args.has("--self-test")) {
  console.log(JSON.stringify(selfTest()));
} else {
  const mapIds = args.get("--maps")?.split(",") ?? MAPS.map(m => m.id);
  const maps = mapIds.map(id => { const m = MAPS.find(m => m.id === id); if (!m) throw new Error(`Unknown map ${id}`); return m; });
  const seeds = (args.get("--seeds") ?? "1,2,3,4,5,6,7,8").split(",").map(Number);
  if (seeds.some(seed => !Number.isSafeInteger(seed) || seed <= 0)) throw new Error("Seeds must be positive safe integers");
  const strategies = (args.get("--strategies") ?? "ballista,archer,mixed").split(",") as Strategy[];
  if (strategies.some(s => !["ballista", "archer", "mixed", "pure-ballista", "pure-archer", "ballista-support", "archer-smart"].includes(s))) throw new Error("Unknown strategy");
  const economy = args.get("--economy") ?? "staged", branch = args.get("--branch") ?? "balanced", placement = args.get("--placement") ?? "coverage";
  if (!["staged", "spread", "rush"].includes(economy) || !["balanced", "fire", "lune"].includes(branch) || !["coverage", "lines", "baseline-coverage"].includes(placement)) throw new Error("Unknown policy setting");
  const out = args.get("--out"); if (!out) throw new Error("Specify --out=/path/to/results.jsonl");
  mkdirSync(dirname(out), { recursive: true }); const stream = createWriteStream(out);
  let n = 0;
  for (const map of maps) for (const seed of seeds) for (const strategy of strategies) {
    const capArg = args.get("--cap");
    const cap = capArg === "archer-plots" ? map.plots.length * 230 : capArg ? Number(capArg) : null;
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) throw new Error("Invalid cap");
    const policy: Policy = { strategy, economy: economy as Policy["economy"], branch: branch as Policy["branch"], placement: placement as Policy["placement"], volley: !args.has("--no-volley"), early: args.has("--early"), cap };
    const options: Options = { map: map.id, seed, policy, observe: true, snapshots: args.has("--pacing"), phases: args.has("--phases") };
    const result = play(options);
    const pacing = args.has("--pacing") ? pacingProbes(result, options) : undefined;
    const { checkpoints: _, lastPurchaseCheckpoint: _last, ...row } = result;
    stream.write(JSON.stringify({ ...row, pacing }) + "\n");
    console.error(`${result.variant} ${++n}/${maps.length * seeds.length * strategies.length} ${map.id}/${seed}/${strategy}: ${result.status}, lives=${result.lives}, spent=${result.spent}, gold=${result.gold}, ${(result.duration / 60).toFixed(1)}m`);
  }
  stream.end();
}
