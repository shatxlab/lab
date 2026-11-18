#!/bin/bash
set -euo pipefail
# From repo root. Cadence diagnostic: runner, bat and scamp spacing x2 only. Outputs stay outside the repo; no save is read or written.
root=${RAW:-$(mktemp -d /tmp/kr-cadence-raw.XXXXXX)}
report=${REPORT:-/tmp/kr-cadence-report}
bundles=$(mktemp -d /tmp/kr-cadence-build.XXXXXX)
mkdir -p "$root"
for variant in baseline cadence-2x; do
  node --experimental-strip-types scripts/kingsroad/study/build.ts "$bundles/$variant.mjs" "$variant"
  node "$bundles/$variant.mjs" --self-test > "$bundles/$variant-self-test.json"
done
for variant in baseline cadence-2x; do
  mkdir -p "$root/$variant"
  pids=()
  for strategy in ballista archer mixed; do
    node "$bundles/$variant.mjs" --strategies="$strategy" --out="$root/$variant/primary-$strategy.jsonl" 2>"$root/$variant/primary-$strategy.log" & pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
  echo "$variant primary complete"
  base=(--maps=ford,rivers,citadel,harvest,hairpin,watch --seeds=1,2,3,4)
  (
    node "$bundles/$variant.mjs" "${base[@]}" --cap=archer-plots --out="$root/$variant/budget.jsonl" 2>"$root/$variant/budget.log"
    node "$bundles/$variant.mjs" "${base[@]}" --no-volley --out="$root/$variant/no-volley.jsonl" 2>"$root/$variant/no-volley.log"
  ) & a=$!
  (
    node "$bundles/$variant.mjs" "${base[@]}" --strategies=pure-ballista,pure-archer --out="$root/$variant/pure.jsonl" 2>"$root/$variant/pure.log"
    node "$bundles/$variant.mjs" "${base[@]}" --strategies=ballista,mixed --placement=lines --out="$root/$variant/lines.jsonl" 2>"$root/$variant/lines.log"
    node "$bundles/$variant.mjs" "${base[@]}" --economy=rush --out="$root/$variant/rush.jsonl" 2>"$root/$variant/rush.log"
  ) & b=$!
  node "$bundles/$variant.mjs" --maps=meadow,ford,crossroads,switchback,rivers --seeds="$(seq -s, 9 32)" --out="$root/$variant/early-extra.jsonl" 2>"$root/$variant/early-extra.log" & c=$!
  wait "$a"; wait "$b"; wait "$c"
  echo "$variant controls complete"
done
node "$bundles/baseline-compare.mjs" "$root" "$report" cadence-2x
echo "Raw: $root; report: $report; bundles: $bundles"
