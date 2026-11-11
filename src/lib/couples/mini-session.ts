import {
  PATTERN_ROUNDS, patternTools, scorePattern,
  type Pattern, type Tile,
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
      return state.phase === "build" && patternTools(state.round).includes(action.tile) ? { ...state, tool: action.tile } : state;
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
