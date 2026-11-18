import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The offline studies froze the eight shipping sim inputs they ran against. Deliberate later changes are recorded as
 * chained "after" manifests, newest last: an input passes if it matches its frozen study hash or any recorded
 * post-change hash, so any *further* accidental edit still fails.
 */
const RECORDS = ["study-inputs-after-bulwark.json", "study-inputs-after-tower-skills.json"].map((name) =>
  JSON.parse(readFileSync(resolve("tests/kingsroad", name), "utf8")) as { hashes: Record<string, string>; reason: string },
);

export function verifyFrozenOrShippedInputs(frozenManifestPath = "reports/kingsroad-study/manifest.json"): void {
  const frozen = JSON.parse(readFileSync(resolve(frozenManifestPath), "utf8")).inputs as Record<string, string>;
  for (const [file, frozenHash] of Object.entries(frozen)) {
    const actual = createHash("sha256").update(readFileSync(resolve(file))).digest("hex");
    if (actual === frozenHash) continue;
    if (!RECORDS.some((record) => record.hashes[file] === actual)) {
      throw new Error(`Shipping input drifted from the frozen study and every recorded re-ship record: ${file}`);
    }
  }
}
