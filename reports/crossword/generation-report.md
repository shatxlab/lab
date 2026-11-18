# Crossword generation expansion — handoff

## Scope / implementation

- Worked on `main`; no commit/push, branch or worktree. Read `AGENTS.md` and `game-design-improvements.md` §5 (durable assistance; unaffected).
- Changed only `scripts/generate-crosswords.mjs`, generated `src/lib/crossword/puzzles.ts`, generated `src/lib/crossword/wordbank.ts`, `tests/crossword/puzzles.test.ts`, and this report. Concurrent UI/storage changes left untouched.
- Exactly 50 puzzles/language, 1,500 entries/language. Target at zero-based index i: `10 + Math.round(i * 40 / 49)`. Preserve generation/index order, not area sorting.
- Each language: 7 easy (10–15), 19 medium (16–30), 24 hard (31–50). Easy vocabulary is an explicit hand-reviewed shortlist, not a length heuristic; longer familiar answers allowed, short specialist answers excluded. Easy subtitles now “Everyday words” / “Знакомые слова”. Medium/hard draw the existing bank.
- Added one common Russian answer/clue: `УЗОР | Рисунок из повторяющихся линий или фигур`. No runtime network/LLM, no mass clue rewrite. Generated `COMMON_ANSWERS` exported for content tests.
- Search indexes letter positions, anchors only on uncrossed perpendicular cells, uses direction masks (rejects same-axis overlaps), bounded top-four candidates rather than sorting everything. Scores crossings, answer length and compact growth; seeded restarts resize only if needed. All shipped results needed <=18 attempts; expansion after attempt 30 was not needed.
- Independent deterministic seed per language/index. At most 120 attempts per puzzle; rejects non-exact counts, density <=0.4 or repeated layout hashes. Throws before either generated file is written if any target cannot be satisfied. Per-board logs show target, dimensions, filled count/density, attempts and time.
- All new IDs are `[en-]cw-v2-NN-<12 hex SHA-256 chars>`. Hash covers canonical, code-unit-sorted serialized `[row,col,dir,answer]` tuples, independent of entry ordering and host locale. Tight bounds derive dimensions from content. Old `cw-01` / `en-cw-01` IDs cannot alias expanded boards. Existing public exports/API shape retained.

## Verification

Command: `NODE_ENV=test npx vitest run tests/crossword/puzzles.test.ts`

Result: **1 file / 16 tests passed**, three runs (954ms, 824ms, final 845ms total). Added exact progression/category endpoints, language identity, v2 hash/legacy-ID disjointness, accessible easy pool, unique answers/boards, connected perpendicular entry graph, every entry crossed, maximal touching runs exactly matching clues, same-axis non-overlap, tight bounds. Existing crossing, density, alphabet, numbering and lookup checks still pass.

`git diff --check -- <four owned repository paths>` passed. No full suite/typecheck or browser check run: main agent handles those and UI/storage. No optional generator test file created.

### Reproducibility / runtime

Two fresh final generator runs produced byte-identical SHA-256 hashes for **both** generated files:

| File | SHA-256 | Bytes |
|---|---|---:|
| `src/lib/crossword/puzzles.ts` | `a77ffe7897b3792a54e905bb3d0ed3a56b2447c6045c0c62eb9b027fb0261295` | 172333 |
| `src/lib/crossword/wordbank.ts` | `3ac35ce899907276d76b7e322e97eaaed932a92d04423b32302605a13378c06c` | 34646 |

Measured whole-process wall times, including both languages and writing files: **2.119230s**, **2.136773s**. Per-board times below are second-run search times rounded by generator to 0.01s (`0.00` is not literally zero).

| Metric | EN | RU |
|---|---:|---:|
| Bank size | 351 | 235 |
| Unique answers used across all boards | 339 | 226 |
| Attempts total / maximum per board | 54 / 2 | 124 / 18 |
| Filled cells min–max | 47–230 | 52–271 |
| Exact minimum density | 162/399 = 40.6015% | 85/210 = 40.4762% |
| Maximum density | 70/120 = 58.3333% | 126/238 = 52.9412% |
| First board | 10 words, 10×11, 51 filled | 10 words, 10×11, 55 filled |
| Last board | 50 words, 24×19, 227 filled | 50 words, 22×23, 242 filled |

Largest board area is RU #49, **24×23 = 552 cells, 49 words, 271 filled**. Maximum dimension is 24. Main agent must accommodate this in save validation/viewport; no storage cap was changed here.

## Inspection / limitations

- Inspected authored easy entries and printed first/last EN/RU grids as text. All 100 pass independent maximal-run, graph-connectivity, crossing and density tests. No orphan words, side-touching un-clued runs, duplicate answers within a puzzle or identical solution boards.
- Word count is monotone; area/dimensions are intentionally not monotone after trimming. Some neighboring boards share a count as required by the rounded target formula.
- Answer reuse between different puzzles remains intentional/necessary (1,500 entries vs 351/235 bank answers). Easy vocabulary familiarity is editorial, not a playtested reading-age guarantee. Existing clue simplifications and broad medium/hard general-knowledge vocabulary remain; no complete clue audit claimed.
- Dense connected freeform crosswords, not rotationally symmetric newspaper grids; not every letter is checked in both directions. Every word has at least one real perpendicular crossing.
- Search is bounded/seeded greedy with restarts, not globally optimal packing. Future bank/seed/weight changes can fail loudly and require retuning; there is no silent underfill fallback. Runtime is this machine's observation, not a benchmark guarantee.
- IDs deliberately change for changed topology/answers; old saves must not be applied to expanded boards. UI/storage/legacy-save policy remains owned by main/other agent. ID tests assert disjoint new IDs, without forbidding a separate legacy lookup.

## Exact per-puzzle inventory (second reproducibility run)

| Language | # | Difficulty | Words | Rows × cols | Filled | Density | Attempts | Search s |
|---|---:|---|---:|---|---:|---:|---:|---:|
| RU | 1 | easy | 10 | 10 × 11 | 55 | 50.0% | 6 | 0.02 |
| RU | 2 | easy | 11 | 11 × 10 | 52 | 47.3% | 18 | 0.02 |
| RU | 3 | easy | 12 | 12 × 10 | 56 | 46.7% | 5 | 0.00 |
| RU | 4 | easy | 12 | 11 × 11 | 56 | 46.3% | 14 | 0.01 |
| RU | 5 | easy | 13 | 11 × 13 | 63 | 44.1% | 4 | 0.00 |
| RU | 6 | easy | 14 | 12 × 12 | 64 | 44.4% | 3 | 0.00 |
| RU | 7 | easy | 15 | 12 × 14 | 69 | 41.1% | 8 | 0.01 |
| RU | 8 | medium | 16 | 14 × 14 | 95 | 48.5% | 3 | 0.03 |
| RU | 9 | medium | 17 | 14 × 14 | 89 | 45.4% | 2 | 0.01 |
| RU | 10 | medium | 17 | 14 × 12 | 77 | 45.8% | 1 | 0.01 |
| RU | 11 | medium | 18 | 14 × 15 | 85 | 40.5% | 1 | 0.01 |
| RU | 12 | medium | 19 | 15 × 15 | 96 | 42.7% | 3 | 0.02 |
| RU | 13 | medium | 20 | 14 × 15 | 101 | 48.1% | 2 | 0.02 |
| RU | 14 | medium | 21 | 15 × 16 | 108 | 45.0% | 1 | 0.01 |
| RU | 15 | medium | 21 | 16 × 16 | 115 | 44.9% | 1 | 0.01 |
| RU | 16 | medium | 22 | 16 × 16 | 113 | 44.1% | 2 | 0.01 |
| RU | 17 | medium | 23 | 16 × 17 | 115 | 42.3% | 2 | 0.01 |
| RU | 18 | medium | 24 | 17 × 16 | 126 | 46.3% | 1 | 0.01 |
| RU | 19 | medium | 25 | 17 × 17 | 138 | 47.8% | 2 | 0.02 |
| RU | 20 | medium | 26 | 14 × 17 | 126 | 52.9% | 1 | 0.01 |
| RU | 21 | medium | 26 | 16 × 18 | 134 | 46.5% | 2 | 0.02 |
| RU | 22 | medium | 27 | 18 × 16 | 134 | 46.5% | 1 | 0.01 |
| RU | 23 | medium | 28 | 18 × 19 | 153 | 44.7% | 2 | 0.02 |
| RU | 24 | medium | 29 | 18 × 18 | 151 | 46.6% | 1 | 0.01 |
| RU | 25 | medium | 30 | 18 × 19 | 156 | 45.6% | 1 | 0.01 |
| RU | 26 | medium | 30 | 19 × 19 | 158 | 43.8% | 1 | 0.01 |
| RU | 27 | hard | 31 | 18 × 19 | 156 | 45.6% | 1 | 0.01 |
| RU | 28 | hard | 32 | 18 × 19 | 148 | 43.3% | 1 | 0.02 |
| RU | 29 | hard | 33 | 19 × 19 | 178 | 49.3% | 2 | 0.04 |
| RU | 30 | hard | 34 | 18 × 20 | 170 | 47.2% | 1 | 0.02 |
| RU | 31 | hard | 34 | 19 × 20 | 180 | 47.4% | 2 | 0.03 |
| RU | 32 | hard | 35 | 19 × 19 | 168 | 46.5% | 2 | 0.03 |
| RU | 33 | hard | 36 | 19 × 21 | 182 | 45.6% | 2 | 0.03 |
| RU | 34 | hard | 37 | 21 × 20 | 205 | 48.8% | 1 | 0.02 |
| RU | 35 | hard | 38 | 21 × 21 | 206 | 46.7% | 3 | 0.06 |
| RU | 36 | hard | 39 | 18 × 22 | 196 | 49.5% | 2 | 0.04 |
| RU | 37 | hard | 39 | 21 × 21 | 189 | 42.9% | 1 | 0.02 |
| RU | 38 | hard | 40 | 21 × 22 | 221 | 47.8% | 4 | 0.08 |
| RU | 39 | hard | 41 | 21 × 22 | 227 | 49.1% | 1 | 0.02 |
| RU | 40 | hard | 42 | 21 × 21 | 229 | 51.9% | 2 | 0.05 |
| RU | 41 | hard | 43 | 22 × 22 | 217 | 44.8% | 1 | 0.03 |
| RU | 42 | hard | 43 | 22 × 22 | 230 | 47.5% | 1 | 0.03 |
| RU | 43 | hard | 44 | 22 × 22 | 239 | 49.4% | 2 | 0.05 |
| RU | 44 | hard | 45 | 22 × 22 | 223 | 46.1% | 1 | 0.03 |
| RU | 45 | hard | 46 | 23 × 21 | 238 | 49.3% | 1 | 0.03 |
| RU | 46 | hard | 47 | 22 × 23 | 229 | 45.3% | 1 | 0.03 |
| RU | 47 | hard | 48 | 23 × 22 | 254 | 50.2% | 1 | 0.03 |
| RU | 48 | hard | 48 | 21 × 23 | 241 | 49.9% | 1 | 0.03 |
| RU | 49 | hard | 49 | 24 × 23 | 271 | 49.1% | 1 | 0.03 |
| RU | 50 | hard | 50 | 22 × 23 | 242 | 47.8% | 1 | 0.03 |
| EN | 1 | easy | 10 | 10 × 11 | 51 | 46.4% | 1 | 0.00 |
| EN | 2 | easy | 11 | 10 × 9 | 47 | 52.2% | 1 | 0.00 |
| EN | 3 | easy | 12 | 9 × 10 | 48 | 53.3% | 2 | 0.00 |
| EN | 4 | easy | 12 | 11 × 10 | 51 | 46.4% | 2 | 0.00 |
| EN | 5 | easy | 13 | 11 × 12 | 65 | 49.2% | 1 | 0.00 |
| EN | 6 | easy | 14 | 9 × 13 | 51 | 43.6% | 1 | 0.00 |
| EN | 7 | easy | 15 | 13 × 11 | 64 | 44.8% | 1 | 0.00 |
| EN | 8 | medium | 16 | 13 × 13 | 81 | 47.9% | 1 | 0.01 |
| EN | 9 | medium | 17 | 13 × 10 | 73 | 56.2% | 1 | 0.01 |
| EN | 10 | medium | 17 | 12 × 10 | 70 | 58.3% | 1 | 0.01 |
| EN | 11 | medium | 18 | 15 × 10 | 65 | 43.3% | 1 | 0.01 |
| EN | 12 | medium | 19 | 14 × 9 | 70 | 55.6% | 1 | 0.01 |
| EN | 13 | medium | 20 | 10 × 15 | 76 | 50.7% | 1 | 0.01 |
| EN | 14 | medium | 21 | 16 × 13 | 114 | 54.8% | 1 | 0.02 |
| EN | 15 | medium | 21 | 15 × 12 | 91 | 50.6% | 1 | 0.01 |
| EN | 16 | medium | 22 | 11 × 16 | 99 | 56.3% | 1 | 0.01 |
| EN | 17 | medium | 23 | 13 × 15 | 93 | 47.7% | 1 | 0.01 |
| EN | 18 | medium | 24 | 17 × 13 | 116 | 52.5% | 1 | 0.01 |
| EN | 19 | medium | 25 | 15 × 17 | 104 | 40.8% | 1 | 0.01 |
| EN | 20 | medium | 26 | 13 × 17 | 112 | 50.7% | 1 | 0.01 |
| EN | 21 | medium | 26 | 14 × 17 | 101 | 42.4% | 1 | 0.01 |
| EN | 22 | medium | 27 | 18 × 13 | 120 | 51.3% | 1 | 0.01 |
| EN | 23 | medium | 28 | 18 × 14 | 117 | 46.4% | 1 | 0.01 |
| EN | 24 | medium | 29 | 18 × 15 | 136 | 50.4% | 1 | 0.02 |
| EN | 25 | medium | 30 | 18 × 14 | 138 | 54.8% | 1 | 0.02 |
| EN | 26 | medium | 30 | 16 × 15 | 107 | 44.6% | 1 | 0.01 |
| EN | 27 | hard | 31 | 17 × 18 | 154 | 50.3% | 1 | 0.02 |
| EN | 28 | hard | 32 | 16 × 20 | 138 | 43.1% | 2 | 0.03 |
| EN | 29 | hard | 33 | 20 × 13 | 134 | 51.5% | 1 | 0.02 |
| EN | 30 | hard | 34 | 20 × 17 | 159 | 46.8% | 1 | 0.02 |
| EN | 31 | hard | 34 | 20 × 13 | 141 | 54.2% | 1 | 0.02 |
| EN | 32 | hard | 35 | 20 × 15 | 141 | 47.0% | 1 | 0.02 |
| EN | 33 | hard | 36 | 18 × 20 | 156 | 43.3% | 1 | 0.02 |
| EN | 34 | hard | 37 | 21 × 18 | 165 | 43.7% | 1 | 0.03 |
| EN | 35 | hard | 38 | 16 × 19 | 154 | 50.7% | 1 | 0.02 |
| EN | 36 | hard | 39 | 21 × 19 | 162 | 40.6% | 1 | 0.02 |
| EN | 37 | hard | 39 | 16 × 20 | 156 | 48.8% | 1 | 0.03 |
| EN | 38 | hard | 40 | 18 × 21 | 167 | 44.2% | 1 | 0.03 |
| EN | 39 | hard | 41 | 20 × 19 | 190 | 50.0% | 1 | 0.03 |
| EN | 40 | hard | 42 | 17 × 22 | 164 | 43.9% | 1 | 0.03 |
| EN | 41 | hard | 43 | 20 × 18 | 204 | 56.7% | 1 | 0.03 |
| EN | 42 | hard | 43 | 20 × 22 | 190 | 43.2% | 1 | 0.03 |
| EN | 43 | hard | 44 | 22 × 21 | 212 | 45.9% | 1 | 0.03 |
| EN | 44 | hard | 45 | 22 × 21 | 213 | 46.1% | 1 | 0.04 |
| EN | 45 | hard | 46 | 19 × 23 | 216 | 49.4% | 1 | 0.04 |
| EN | 46 | hard | 47 | 21 × 23 | 230 | 47.6% | 1 | 0.04 |
| EN | 47 | hard | 48 | 23 × 17 | 216 | 55.2% | 1 | 0.04 |
| EN | 48 | hard | 48 | 19 × 23 | 211 | 48.3% | 2 | 0.04 |
| EN | 49 | hard | 49 | 22 × 19 | 221 | 52.9% | 1 | 0.04 |
| EN | 50 | hard | 50 | 24 × 19 | 227 | 49.8% | 1 | 0.04 |
