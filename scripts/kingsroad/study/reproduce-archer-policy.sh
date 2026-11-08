#!/bin/bash
set -euo pipefail
# From repo root. Role-appropriate Archer policy at stock stats: archer-smart vs the stock archer, same engine build.
# Outputs stay outside the repo; no production save is read or written.
root=${RAW:-$(mktemp -d /tmp/kr-archer-raw.XXXXXX)}
bundles=$(mktemp -d /tmp/kr-archer-build.XXXXXX)
mkdir -p "$root/smart" "$root/stock"
node --experimental-strip-types scripts/kingsroad/study/build.ts "$bundles/baseline.mjs" baseline
node "$bundles/baseline.mjs" --self-test > "$bundles/self-test.json"
pids=()
for arm in smart stock; do
  strategy=$([ "$arm" = smart ] && echo archer-smart || echo archer)
  node "$bundles/baseline.mjs" --strategies="$strategy" --out="$root/$arm/primary.jsonl" 2>"$root/$arm/primary.log" & pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
echo "primary complete"
base=(--maps=ford,rivers,citadel,harvest,hairpin,watch --seeds=1,2,3,4)
node "$bundles/baseline.mjs" "${base[@]}" --strategies=archer-smart --cap=archer-plots --out="$root/smart/budget.jsonl" 2>"$root/smart/budget.log"
node "$bundles/baseline.mjs" "${base[@]}" --strategies=archer --cap=archer-plots --out="$root/stock/budget.jsonl" 2>"$root/stock/budget.log"
node "$bundles/baseline.mjs" "${base[@]}" --strategies=archer-smart --no-volley --out="$root/smart/no-volley.jsonl" 2>"$root/smart/no-volley.log"
node "$bundles/baseline.mjs" "${base[@]}" --strategies=archer --no-volley --out="$root/stock/no-volley.jsonl" 2>"$root/stock/no-volley.log"
node "$bundles/baseline.mjs" --maps=meadow,ford,crossroads,switchback,rivers --seeds="$(seq -s, 9 32)" --strategies=archer-smart --out="$root/smart/early-extra.jsonl" 2>"$root/smart/early-extra.log" &
node "$bundles/baseline.mjs" --maps=meadow,ford,crossroads,switchback,rivers --seeds="$(seq -s, 9 32)" --strategies=archer --out="$root/stock/early-extra.jsonl" 2>"$root/stock/early-extra.log" &
wait
echo "Raw: $root; bundle: $bundles"
