#!/usr/bin/env bash
# Run from the repository root. Outputs stay outside the repo unless REPORT explicitly points into it.
set -euo pipefail
RAW=${RAW:-$(mktemp -d /tmp/kingsroad-study.XXXXXX)}
REPORT=${REPORT:-/tmp/kingsroad-study-report}
BUNDLE=${BUNDLE:-/tmp/kingsroad-study.mjs}
mkdir -p "$RAW"
node --experimental-strip-types scripts/kingsroad/study/build.ts "$BUNDLE"
node "$BUNDLE" --self-test > "$RAW/self-test.json"
pids=()
for strategy in ballista archer mixed; do
  node "$BUNDLE" --strategies="$strategy" --out="$RAW/baseline-$strategy.jsonl" 2> "$RAW/baseline-$strategy.log" & pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
base=(--maps=ford,rivers,citadel,harvest,hairpin,watch --seeds=1,2,3,4)
run() { node "$BUNDLE" "${base[@]}" "$@"; }
(
  run --economy=spread --out="$RAW/economy-spread.jsonl" 2> "$RAW/economy-spread.log"
  run --economy=rush --out="$RAW/economy-rush.jsonl" 2> "$RAW/economy-rush.log"
  run --cap=archer-plots --out="$RAW/equal-cap.jsonl" 2> "$RAW/equal-cap.log"
) & a=$!
(
  run --strategies=ballista,mixed --placement=lines --out="$RAW/lines.jsonl" 2> "$RAW/lines.log"
  run --early --out="$RAW/early.jsonl" 2> "$RAW/early.log"
  run --no-volley --out="$RAW/no-volley.jsonl" 2> "$RAW/no-volley.log"
) & b=$!
(
  for branch in fire lune; do
    node "$BUNDLE" --maps=harvest,orchards,hairpin,crows,detour,watch --seeds=1,2,3,4 --strategies=archer,mixed --economy=rush --branch="$branch" --out="$RAW/branch-$branch.jsonl" 2> "$RAW/branch-$branch.log"
  done
  run --strategies=pure-ballista,pure-archer --out="$RAW/pure.jsonl" 2> "$RAW/pure.log"
) & c=$!
wait "$a"; wait "$b"; wait "$c"
pids=()
for strategy in ballista mixed; do
  node "$BUNDLE" --maps=ford,rivers,citadel,hairpin,gauntlet,watch --seeds=1,2,3 --strategies="$strategy" --pacing --out="$RAW/pacing-$strategy.jsonl" 2> "$RAW/pacing-$strategy.log" & pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
node "${BUNDLE%.mjs}-summarize.mjs" "$RAW" "$REPORT"
echo "Raw: $RAW; report: $REPORT"
