import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The offline studies froze the eight shipping sim inputs they ran against. Five of them later changed deliberately,
 * in one batch: the bulwark foe (hitCap 12) shipped to harvest and kings. This guard keeps its teeth — every input
 * must match either its frozen study hash or the recorded post-bulwark hash, so any *further* accidental edit fails.
 */
const SHIPPED = JSON.parse(readFileSync(resolve("tests/kingsroad/study-inputs-after-bulwark.json"), "utf8")) as { hashes: Record<string, string> };

export function verifyFrozenOrShippedInputs(frozenManifestPath = "reports/kingsroad-study/manifest.json"): void {
  const frozen = JSON.parse(readFileSync(resolve(frozenManifestPath), "utf8")).inputs as Record<string, string>;
  for (const [file, frozenHash] of Object.entries(frozen)) {
    const actual = createHash("sha256").update(readFileSync(resolve(file))).digest("hex");
    if (actual === frozenHash) continue;
    if (SHIPPED.hashes[file] !== actual) {
      throw new Error(`Shipping input drifted from both the frozen study and the recorded post-bulwark state: ${file}`);
    }
  }
}
