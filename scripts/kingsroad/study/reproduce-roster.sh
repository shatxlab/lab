#!/bin/bash
set -euo pipefail
# From repo root. Roster distribution diagnostic: scamp/runner columns split round-robin across roads.
# Same foes, counts and times; single-road maps are untouched controls. Outputs stay outside the repo.
root=${RAW:-$(mktemp -d /tmp/kr-roster-raw.XXXXXX)}
bundles=$(mktemp -d /tmp/kr-roster-build.XXXXXX)
strats=ballista,archer,mixed,archer-smart
mkdir -p "$root/baseline" "$root/roster-spread"
for variant in baseline roster-spread; do
  node --experimental-strip-types scripts/kingsroad/study/build.ts "$bundles/$variant.mjs" "$variant"
  node "$bundles/$variant.mjs" --self-test > "$bundles/$variant-self-test.json"
done
for variant in baseline roster-spread; do
  pids=()
  node "$bundles/$variant.mjs" --strategies=$strats --out="$root/$variant/primary.jsonl" 2>"$root/$variant/primary.log" & pids+=("$!")
  base=(--maps=ford,rivers,citadel,harvest,hairpin,watch --seeds=1,2,3,4)
  node "$bundles/$variant.mjs" "${base[@]}" --strategies=$strats --cap=archer-plots --out="$root/$variant/budget.jsonl" 2>"$root/$variant/budget.log" & pids+=("$!")
  node "$bundles/$variant.mjs" "${base[@]}" --strategies=$strats --no-volley --out="$root/$variant/no-volley.jsonl" 2>"$root/$variant/no-volley.log" & pids+=("$!")
  for pid in "${pids[@]}"; do wait "$pid"; done
  echo "$variant complete"
done
echo "Raw: $root; bundles: $bundles"
