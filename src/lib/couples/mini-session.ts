import {
  PATTERN_ROUNDS, SPLIT_ROUNDS, scorePattern, splitPayoff,
  type Pattern, type Player, type SplitChoice, type SplitRound, type Tile,
} from "./mini-games";

export type PatternPhase = "handoff-study" | "study" | "handoff-build" | "build" | "handoff-peek" | "peek" | "reveal-ready" | "result" | "summary";
export interface PatternRoundResult extends ReturnType<typeof scorePattern> { peeks: number }
export interface PatternState {
  phase: PatternPhase;
  round: number;
  target: Pattern;
  draft: Pattern;
  tool: Tile;
  peeks: number;
  results: PatternRoundResult[];
}
export function initialPattern(target: Pattern): PatternState {
  return { phase: "handoff-study", round: 0, target, draft: Array(9).fill(0), tool: 1, peeks: 0, results: [] };
}
export type PatternAction =
  | { type: "ready" } | { type: "pass" } | { type: "peek" } | { type: "prepare-reveal" } | { type: "reveal" }
  | { type: "tool"; tile: Tile } | { type: "place"; cell: number }
  | { type: "next"; target: Pattern } | { type: "finish" };
export function patternReducer(state: PatternState, action: PatternAction): PatternState {
  switch (action.type) {
    case "ready": {
      const phases = { "handoff-study": "study", "handoff-build": "build", "handoff-peek": "peek" } as const;
      return state.phase in phases ? { ...state, phase: phases[state.phase as keyof typeof phases] } : state;
    }
    case "pass":
      return state.phase === "study" || state.phase === "peek" ? { ...state, phase: "handoff-build" } : state;
    case "peek":
      return state.phase === "build" ? { ...state, phase: "handoff-peek", peeks: state.peeks + 1 } : state;
    case "tool":
      return state.phase === "build" && [0, 1, 2, 3].includes(action.tile) ? { ...state, tool: action.tile } : state;
    case "place":
      return state.phase === "build" && Number.isInteger(action.cell) && action.cell >= 0 && action.cell < 9
        ? { ...state, draft: state.draft.map((tile, i) => i === action.cell ? state.tool : tile) } : state;
    case "prepare-reveal":
      return state.phase === "build" ? { ...state, phase: "reveal-ready" } : state;
    case "reveal":
      return state.phase === "reveal-ready" ? {
        ...state, phase: "result", results: [...state.results, { ...scorePattern(state.target, state.draft), peeks: state.peeks }],
      } : state;
    case "next":
      return state.phase === "result" && state.round + 1 < PATTERN_ROUNDS ? {
        ...initialPattern(action.target), round: state.round + 1, results: state.results,
      } : state;
    case "finish":
      return state.phase === "result" && state.round + 1 === PATTERN_ROUNDS
        ? { ...state, phase: "summary", target: [], draft: [] } : state;
  }
}

export type SplitPhase = "negotiate" | "handoff-first" | "choose-first" | "handoff-second" | "choose-second" | "locked" | "result" | "summary";
export interface SplitState {
  phase: SplitPhase;
  round: number;
  pending: [SplitChoice | null, SplitChoice | null];
  results: SplitRound[];
}
export function initialSplit(): SplitState {
  return { phase: "negotiate", round: 0, pending: [null, null], results: [] };
}
export function firstChooser(round: number): Player { return (round % 2) as Player; }
export type SplitAction = { type: "begin" | "ready" | "reveal" | "next" | "finish" } | { type: "choose"; choice: SplitChoice };
export function splitReducer(state: SplitState, action: SplitAction): SplitState {
  switch (action.type) {
    case "begin": return state.phase === "negotiate" ? { ...state, phase: "handoff-first" } : state;
    case "ready":
      if (state.phase === "handoff-first") return { ...state, phase: "choose-first" };
      if (state.phase === "handoff-second") return { ...state, phase: "choose-second" };
      return state;
    case "choose": {
      if (state.phase !== "choose-first" && state.phase !== "choose-second") return state;
      if (action.choice !== "split" && action.choice !== "steal") return state;
      const first = firstChooser(state.round);
      const player = state.phase === "choose-first" ? first : (1 - first) as Player;
      const pending: SplitState["pending"] = [...state.pending];
      pending[player] = action.choice;
      return { ...state, pending, phase: state.phase === "choose-first" ? "handoff-second" : "locked" };
    }
    case "reveal": {
      if (state.phase !== "locked") return state;
      const [a, b] = state.pending;
      if (!a || !b) return state;
      return { ...state, phase: "result", pending: [null, null], results: [...state.results, { choices: [a, b], coins: splitPayoff(a, b) }] };
    }
    case "next":
      return state.phase === "result" && state.round + 1 < SPLIT_ROUNDS
        ? { ...initialSplit(), round: state.round + 1, results: state.results } : state;
    case "finish":
      return state.phase === "result" && state.round + 1 === SPLIT_ROUNDS ? { ...state, phase: "summary" } : state;
  }
}
