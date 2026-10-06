import {
  ArrowLeft,
  Check,
  CircleHelp,
  Eraser,
  Info,
  Lightbulb,
  List,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties, InputEventHandler, KeyboardEvent } from "react";

import { ClueBar } from "./ClueBar";
import { CluePanel, ClueSheet } from "./CluePanel";
import { CompletionOverlay } from "./CompletionOverlay";
import { Grid } from "./Grid";

import { useKeyboardInset } from "./useKeyboardInset";
import {
  activeEntry,
  crosswordReducer,
  formatDuration,
  initialState,
  isPuzzleSolved,
  parseInput,
  progress,
  solvedEntryIds,
  wrongCells,
  type CrosswordAction,
  type CrosswordState,
} from "@/lib/crossword/game";
import { cellKey, entryById } from "@/lib/crossword/grid";
import { stringsFor } from "@/lib/crossword/i18n";
import type { CrosswordSoundEngine } from "@/lib/crossword/sound";
import { applyStoredProgress, toStoredProgress, type StoredPuzzleProgress } from "@/lib/crossword/storage";
import type { BuiltPuzzle, Lang } from "@/lib/crossword/types";

interface BoardProps {
  built: BuiltPuzzle;
  lang: Lang;
  saved: StoredPuzzleProgress | undefined;
  hasNext: boolean;
  sound: CrosswordSoundEngine;
  soundOn: boolean;
  onToggleSound(): void;
  onPersist(id: string, progress: StoredPuzzleProgress): void;
  onBack(): void;
  onNext(): void;
}

interface Toast {
  text: string;
  detail?: string;
  /** success = green check, warn = problem found, info = neutral note. */
  tone: "success" | "warn" | "info";
}

const TOAST_ICONS = { success: Check, warn: TriangleAlert, info: Info } as const;

export function Board({
  built,
  lang,
  saved,
  hasNext,
  sound,
  soundOn,
  onToggleSound,
  onPersist,
  onBack,
  onNext,
}: BoardProps) {
  const TXT = stringsFor(lang);
  const [state, dispatch] = useReducer(
    (prev: CrosswordState, action: CrosswordAction) => crosswordReducer(built, prev, action),
    built,
    (board) => applyStoredProgress(initialState(board), saved),
  );

  const inset = useKeyboardInset();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [focused, setFocused] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [cluesOpen, setCluesOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const values = state.values;
  const current = activeEntry(built, state.cursor);
  const activeEntryId = current?.id ?? null;
  const solved = useMemo(() => solvedEntryIds(built, values), [built, values]);
  const completedNow = solved.size === built.entries.length && built.entries.length > 0;
  const stats = useMemo(() => progress(built, values), [built, values]);
  const percent = stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0;

  const activeCells = useMemo(() => {
    const set = new Set<string>();
    if (current) for (const cell of current.cells) set.add(cellKey(cell.row, cell.col));
    return set;
  }, [current]);

  const solvedCells = useMemo(() => {
    const set = new Set<string>();
    for (const entry of built.entries) {
      if (!solved.has(entry.id)) continue;
      for (const cell of entry.cells) set.add(cellKey(cell.row, cell.col));
    }
    return set;
  }, [built, solved]);

  const wrong = useMemo(
    () => (state.checked ? wrongCells(built, values) : new Set<string>()),
    [built, values, state.checked],
  );
  const revealed = useMemo(() => new Set(state.revealed), [state.revealed]);

  const started = Object.keys(values).length > 0;
  const timerActive = started && !completedNow;

  // Mount-time snapshots so resuming a saved board does not fire celebrations.
  const prevSolvedRef = useRef<Set<string> | null>(null);
  if (prevSolvedRef.current === null) {
    prevSolvedRef.current = saved ? solvedEntryIds(built, saved.values) : new Set<string>();
  }
  const wasCompleteRef = useRef<boolean>(saved ? isPuzzleSolved(built, saved.values) : false);

  const showToast = useCallback((next: Toast) => {
    setToast(next);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // Timer only runs once letters exist and before the board is solved.
  useEffect(() => {
    if (!timerActive) return undefined;
    const id = window.setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => window.clearInterval(id);
  }, [timerActive]);

  // Finale: play the win sting, celebrate and persist the completion.
  useEffect(() => {
    if (completedNow && !wasCompleteRef.current) {
      sound.play("win");
      setShowComplete(true);
      onPersist(built.puzzle.id, toStoredProgress(stateRef.current, true));
    }
    wasCompleteRef.current = completedNow;
  }, [completedNow, sound, onPersist, built.puzzle.id]);

  // Per-word feedback whenever a new word becomes fully correct.
  useEffect(() => {
    const previous = prevSolvedRef.current ?? new Set<string>();
    prevSolvedRef.current = solved;
    if (completedNow) return;
    const newly = [...solved].filter((id) => !previous.has(id));
    if (newly.length === 0) return;
    const entry = entryById(built, newly[newly.length - 1]);
    if (entry) {
      sound.play("word");
      showToast({ text: TXT.wordSolved, detail: entry.answer, tone: "success" });
    }
  }, [solved, completedNow, built, sound, showToast]);

  // Persist on every meaningful change (cursor moves are intentionally skipped).
  useEffect(() => {
    onPersist(built.puzzle.id, toStoredProgress(stateRef.current, completedNow));
  }, [values, state.revealed, state.elapsed, completedNow, built.puzzle.id, onPersist]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(pointer: fine)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleChange = useCallback(
    (text: string) => {
      const letters = parseInput(text, lang);
      if (letters.length === 0) return;
      sound.resume();
      dispatch({ type: "type", letters });
    },
    [sound],
  );

  const lastBackspaceRef = useRef(0);
  // Some mobile keyboards fire both keydown and beforeinput for one Backspace;
  // coalesce them so a single tap never deletes two cells.
  const handleBackspace = useCallback(() => {
    const now = Date.now();
    if (now - lastBackspaceRef.current < 60) return;
    lastBackspaceRef.current = now;
    dispatch({ type: "backspace" });
  }, []);

  // Android keyboards often skip keydown for Backspace; beforeinput catches it.
  const handleBeforeInput = useCallback<InputEventHandler<HTMLInputElement>>((event) => {
    const native = event.nativeEvent as InputEvent;
    if (native.inputType?.startsWith("delete")) {
      event.preventDefault();
      handleBackspace();
    }
  }, [handleBackspace]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    const { key } = event;
    if (key === "Backspace") {
      event.preventDefault();
      handleBackspace();
    } else if (key === "ArrowLeft") {
      event.preventDefault();
      dispatch({ type: "move", dr: 0, dc: -1 });
    } else if (key === "ArrowRight") {
      event.preventDefault();
      dispatch({ type: "move", dr: 0, dc: 1 });
    } else if (key === "ArrowUp") {
      event.preventDefault();
      dispatch({ type: "move", dr: -1, dc: 0 });
    } else if (key === "ArrowDown") {
      event.preventDefault();
      dispatch({ type: "move", dr: 1, dc: 0 });
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      dispatch({ type: "toggleDirection" });
    } else if (key === "Tab") {
      event.preventDefault();
      dispatch({ type: "nextEntry", step: event.shiftKey ? -1 : 1 });
    } else if (key === "Escape") {
      inputRef.current?.blur();
    }
  }, []);

  const handleSelectCell = useCallback(
    (row: number, col: number) => {
      sound.resume();
      const cursor = stateRef.current.cursor;
      if (row === cursor.row && col === cursor.col) dispatch({ type: "toggleDirection" });
      else dispatch({ type: "select", row, col });
      focusInput();
    },
    [sound, focusInput],
  );

  const handleSelectEntry = useCallback(
    (id: string) => {
      dispatch({ type: "selectEntry", id });
      setCluesOpen(false);
      if (window.matchMedia?.("(pointer: fine)").matches) focusInput();
    },
    [focusInput],
  );

  const handlePrev = useCallback(() => {
    dispatch({ type: "nextEntry", step: -1 });
    focusInput();
  }, [focusInput]);

  const handleNextClue = useCallback(() => {
    dispatch({ type: "nextEntry", step: 1 });
    focusInput();
  }, [focusInput]);

  const handleCheck = useCallback(() => {
    const filled = Object.keys(stateRef.current.values).length;
    if (filled === 0) {
      showToast({ text: TXT.nothingToCheck, tone: "info" });
      return;
    }
    const wrongSet = wrongCells(built, stateRef.current.values);
    dispatch({ type: "check" });
    sound.play(wrongSet.size > 0 ? "error" : "word");
    showToast(
      wrongSet.size > 0
        ? { text: TXT.wrongMarked, tone: "warn" }
        : { text: TXT.noWrong, tone: "success" },
    );
  }, [built, sound, showToast]);

  const handleHint = useCallback(() => {
    dispatch({ type: "reveal" });
    sound.play("tap");
    showToast({ text: TXT.letterRevealed, tone: "info" });
  }, [sound, showToast]);

  const resetBoard = useCallback(() => {
    dispatch({ type: "reset" });
    wasCompleteRef.current = false;
    prevSolvedRef.current = new Set<string>();
    setShowComplete(false);
    onPersist(built.puzzle.id, toStoredProgress(initialState(built), false));
  }, [built, onPersist]);

  const handleReplay = useCallback(() => {
    resetBoard();
    focusInput();
  }, [resetBoard, focusInput]);

  const confirmClearNow = useCallback(() => {
    setConfirmClear(false);
    resetBoard();
  }, [resetBoard]);

  return (
    <div className="cw-board" style={{ "--cw-kb": `${inset}px` } as CSSProperties}>
      <header className="cw-topbar">
        <button type="button" className="cw-icon-button" onClick={onBack} aria-label={TXT.back}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="cw-topbar-title">
          <span className="cw-topbar-name">{built.puzzle.title}</span>
          <span className="cw-topbar-meta">
            {stats.solved}/{stats.total} · {formatDuration(state.elapsed)}
          </span>
        </div>
        <div className="cw-topbar-actions">
          <button
            type="button"
            className="cw-icon-button"
            onClick={onToggleSound}
            aria-label={soundOn ? TXT.soundOn : TXT.soundOff}
            aria-pressed={soundOn}
          >
            {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
        </div>
      </header>
      <div className="cw-progress-track" aria-hidden="true">
        <span className="cw-progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="cw-layout">
        <div className="cw-main">
          <ClueBar
            entry={current}
            lang={lang}
            solved={current ? solved.has(current.id) : false}
            hint={TXT.inputHint}
            onPrev={handlePrev}
            onNext={handleNextClue}
          />
          <div className="cw-stage">
            <Grid
              built={built}
              values={values}
              cursor={state.cursor}
              activeCells={activeCells}
              solvedCells={solvedCells}
              wrong={wrong}
              revealed={revealed}
              focused={focused}
              inputRef={inputRef}
              onSelect={handleSelectCell}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onBeforeInput={handleBeforeInput}
              onFocusChange={setFocused}
            />
          </div>
          <div className="cw-actions">
            <button type="button" className="cw-tool-button" onClick={handleCheck}>
              <CircleHelp aria-hidden="true" />
              <span>{TXT.check}</span>
            </button>
            <button type="button" className="cw-tool-button" onClick={handleHint}>
              <Lightbulb aria-hidden="true" />
              <span>{TXT.hint}</span>
              {state.revealed.length > 0 ? <span className="cw-tool-count">{state.revealed.length}</span> : null}
            </button>
            <button type="button" className="cw-tool-button cw-tool-clues" onClick={() => setCluesOpen(true)}>
              <List aria-hidden="true" />
              <span>{TXT.clues}</span>
            </button>
            <button type="button" className="cw-tool-button" onClick={() => setConfirmClear(true)}>
              <Eraser aria-hidden="true" />
              <span>{TXT.clear}</span>
            </button>
          </div>
        </div>
        <aside className="cw-side">
          <CluePanel built={built} activeEntryId={activeEntryId} solved={solved} onSelect={handleSelectEntry} />
        </aside>
      </div>

      <ClueSheet
        open={cluesOpen}
        onClose={() => setCluesOpen(false)}
        built={built}
        activeEntryId={activeEntryId}
        solved={solved}
        onSelect={handleSelectEntry}
      />

      {toast ? (
        <div className="cw-toast" role="status" data-tone={toast.tone}>
          <span className="cw-toast-icon">
            {(() => {
              const Icon = TOAST_ICONS[toast.tone];
              return <Icon aria-hidden="true" />;
            })()}
          </span>
          <span className="cw-toast-text">
            <span className="cw-toast-title">{toast.text}</span>
            {toast.detail ? <span className="cw-toast-detail">{toast.detail}</span> : null}
          </span>
        </div>
      ) : null}

      {showComplete ? (
        <CompletionOverlay
          built={built}
          lang={lang}
          elapsed={state.elapsed}
          hints={state.revealed.length}
          hasNext={hasNext}
          onReplay={handleReplay}
          onNext={onNext}
          onList={onBack}
        />
      ) : null}

      {confirmClear ? (
        <div className="cw-modal" role="dialog" aria-modal="true" aria-label={TXT.clearTitle}>
          <div className="cw-modal-card">
            <h2>{TXT.clearTitle}</h2>
            <p>{TXT.clearBody}</p>
            <div className="cw-modal-actions">
              <button type="button" className="cw-secondary-button" onClick={() => setConfirmClear(false)}>
                {TXT.cancel}
              </button>
              <button type="button" className="cw-danger-button" onClick={confirmClearNow}>
                {TXT.confirm}
              </button>
            </div>
            <button
              type="button"
              className="cw-modal-close"
              onClick={() => setConfirmClear(false)}
              aria-label={TXT.close}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
