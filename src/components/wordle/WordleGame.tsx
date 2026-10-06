import * as React from "react";
import { BarChart3, CircleHelp, Delete, RotateCcw, Settings } from "lucide-react";

import { Modal } from "@/components/apps/Modal";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import type { AppLang } from "@/lib/apps/lang";
import {
  evaluateGuess,
  keyStates,
  MAX_GUESSES,
  newGame,
  RECENT_LIMIT,
  shareText,
  submitGuess,
  WORD_LENGTH,
  type GameState,
  type LetterState,
  type SubmitError,
} from "@/lib/wordle/game";
import { tw } from "@/lib/wordle/i18n";
import { KEYBOARD_ROWS, letterFromKeyEvent } from "@/lib/wordle/layout";
import { createWordleSoundEngine, type WordleSoundEngine } from "@/lib/wordle/sound";
import { defaultStore, readWordleStore, recordResult, writeWordleStore, type WordleStore } from "@/lib/wordle/storage";
import { cn } from "@/lib/viewer/utils";

/** Time for the five tiles to flip over before the next action is allowed. */
const REVEAL_MS = 1900;

type DialogKind = "help" | "stats" | "settings" | "end" | "confirm" | null;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export default function WordleGame() {
  const lang = useAppLang();
  const readyRef = useLangReady<HTMLDivElement>();

  const [store, setStore] = React.useState<WordleStore>(defaultStore);
  const storeRef = React.useRef(store);
  const [hydrated, setHydrated] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  /** How many guesses have finished their flip animation (drives colours). */
  const [revealed, setRevealed] = React.useState(0);
  const [revealing, setRevealing] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [announcement, setAnnouncement] = React.useState("");
  const [shakeRow, setShakeRow] = React.useState<number | null>(null);
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const timers = React.useRef<number[]>([]);

  const soundRef = React.useRef<WordleSoundEngine | null>(null);
  soundRef.current ??= createWordleSoundEngine(true);
  const sound = soundRef.current;

  const game: GameState | undefined = store.games[lang];

  const commit = React.useCallback((updater: (current: WordleStore) => WordleStore) => {
    const next = updater(storeRef.current);
    storeRef.current = next;
    setStore(next);
    writeWordleStore(next);
  }, []);

  // Load saved state after mount (keeps the server render deterministic).
  React.useEffect(() => {
    const saved = readWordleStore();
    storeRef.current = saved;
    setStore(saved);
    sound.setEnabled(saved.settings.sound);
    setHydrated(true);
    return () => timers.current.forEach((id) => window.clearTimeout(id));
  }, [sound]);

  // Make sure the current language always has a game in progress.
  React.useEffect(() => {
    if (!hydrated) return;
    const existing = storeRef.current.games[lang];
    if (existing) {
      setRevealed(existing.guesses.length);
    } else {
      commit((current) => ({ ...current, games: { ...current.games, [lang]: newGame(lang, current.recent[lang]) } }));
      setRevealed(0);
    }
    setTyped("");
    setRevealing(false);
  }, [lang, hydrated, commit]);

  React.useEffect(() => {
    sound.setEnabled(store.settings.sound);
  }, [store.settings.sound, sound]);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const showToast = React.useCallback((message: string) => {
    setToast(message);
    setAnnouncement(message);
    const id = window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 2200);
    timers.current.push(id);
  }, []);

  const errorMessage = React.useCallback(
    (error: { kind: SubmitError; letter?: string; index?: number }): string => {
      if (error.kind === "short") return tw(lang, "short");
      const letter = (error.letter ?? "").toUpperCase();
      if (error.kind === "hard-position") return tw(lang, "hardPosition", { n: (error.index ?? 0) + 1, letter });
      return tw(lang, "hardInclude", { letter });
    },
    [lang],
  );

  const stateWord = React.useCallback(
    (state: LetterState) => tw(lang, state === "correct" ? "stateCorrect" : state === "present" ? "statePresent" : "stateAbsent"),
    [lang],
  );

  const playing = Boolean(game && game.status === "playing" && !revealing && dialog === null);

  const addLetter = React.useCallback(
    (letter: string) => {
      if (!playing) return;
      sound.resume();
      setTyped((current) => {
        if (current.length >= WORD_LENGTH) return current;
        sound.play("key");
        return current + letter;
      });
    },
    [playing, sound],
  );

  const removeLetter = React.useCallback(() => {
    if (!playing) return;
    setTyped((current) => {
      if (current === "") return current;
      sound.play("delete");
      return current.slice(0, -1);
    });
  }, [playing, sound]);

  const submit = React.useCallback(() => {
    if (!playing || !game) return;
    const outcome = submitGuess(game, typed, { hardMode: store.settings.hardMode });

    if (outcome.error) {
      showToast(errorMessage(outcome.error));
      sound.play("error");
      setShakeRow(game.guesses.length);
      later(() => setShakeRow(null), 600);
      return;
    }

    const next = outcome.state;
    const evaluation = outcome.evaluation ?? evaluateGuess(typed, game.answer);
    const duration = prefersReducedMotion() ? 0 : REVEAL_MS;
    const finished = next.status !== "playing";

    commit((current) => {
      const updated: WordleStore = { ...current, games: { ...current.games, [lang]: next } };
      if (finished) {
        updated.stats = { ...current.stats, [lang]: recordResult(current.stats[lang], next) };
        updated.recent = { ...current.recent, [lang]: [...current.recent[lang], next.answer].slice(-RECENT_LIMIT) };
      }
      return updated;
    });
    setTyped("");
    setRevealing(true);
    sound.play("reveal");

    const letters = Array.from(typed)
      .map((letter, index) => tw(lang, "letterResult", { letter: letter.toUpperCase(), state: stateWord(evaluation[index]!) }))
      .join(", ");

    later(() => {
      setRevealed(next.guesses.length);
      setRevealing(false);
      setAnnouncement(tw(lang, "guessResult", { n: next.guesses.length, max: MAX_GUESSES, letters }));
      if (finished) {
        sound.play(next.status === "won" ? "win" : "lose");
        later(() => setDialog("end"), duration === 0 ? 0 : 700);
      }
    }, duration);
  }, [playing, game, typed, store.settings.hardMode, showToast, errorMessage, sound, commit, lang, stateWord]);

  // Physical keyboard.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      // Enter submits the guess, except where it has its own job: links, form
      // controls and buttons other than the letter keys (after tapping letters on
      // screen, focus sits on a key and Enter should still submit).
      const ownsEnter = target?.closest("a, input, select, textarea, button:not(.wd-key), .wd-key-wide");

      if (event.key === "Enter") {
        if (ownsEnter) return;
        event.preventDefault();
        submit();
      } else if (event.key === "Backspace") {
        if (target?.closest("input, textarea")) return;
        event.preventDefault();
        removeLetter();
      } else {
        if (target?.closest("input, textarea, select")) return;
        const letter = letterFromKeyEvent(lang, event);
        if (letter) {
          event.preventDefault();
          addLetter(letter);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lang, addLetter, removeLetter, submit]);

  const startNewGame = React.useCallback(() => {
    commit((current) => {
      const previous = current.games[lang];
      let stats = current.stats[lang];
      let recent = current.recent[lang];
      // Abandoning a game in progress counts as a loss, as in the original.
      if (previous && previous.status === "playing" && previous.guesses.length > 0) {
        stats = recordResult(stats, { ...previous, status: "lost" });
        recent = [...recent, previous.answer].slice(-RECENT_LIMIT);
      }
      return {
        ...current,
        stats: { ...current.stats, [lang]: stats },
        recent: { ...current.recent, [lang]: recent },
        games: { ...current.games, [lang]: newGame(lang, recent) },
      };
    });
    setTyped("");
    setRevealed(0);
    setRevealing(false);
    setToast("");
    setDialog(null);
  }, [commit, lang]);

  const requestNewGame = () => {
    if (game && game.status === "playing" && game.guesses.length > 0) setDialog("confirm");
    else startNewGame();
  };

  const settings = store.settings;
  // Dialogs are portalled outside the shell, so they carry the theme variables themselves.
  const modalClass = cn("lab-modal-md wd-theme", settings.highContrast && "wd-hc");
  const states = React.useMemo(() => (game ? keyStates(game.guesses.slice(0, revealed), game.answer) : {}), [game, revealed]);

  return (
    <div ref={readyRef} data-lang-sensitive="" className={cn("wd-shell", settings.highContrast && "wd-hc")}>
      <header className="wd-header">
        <h1 className="wd-title">{tw(lang, "title")}</h1>
        <div className="wd-actions">
          <IconButton label={tw(lang, "help")} onClick={() => setDialog("help")}>
            <CircleHelp aria-hidden="true" />
          </IconButton>
          <IconButton label={tw(lang, "stats")} onClick={() => setDialog("stats")}>
            <BarChart3 aria-hidden="true" />
          </IconButton>
          <IconButton label={tw(lang, "settings")} onClick={() => setDialog("settings")}>
            <Settings aria-hidden="true" />
          </IconButton>
          <IconButton label={tw(lang, "newGame")} onClick={requestNewGame}>
            <RotateCcw aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <div className="wd-toast-area" aria-hidden="true">
        {toast && <div className="wd-toast">{toast}</div>}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="wd-main">
        <Board lang={lang} game={game} typed={typed} revealed={revealed} revealing={revealing} shakeRow={shakeRow} />
      </div>

      <Keyboard lang={lang} states={states} onLetter={addLetter} onEnter={submit} onBackspace={removeLetter} disabled={!playing && dialog === null} />

      <Modal open={dialog === "help"} onClose={() => setDialog(null)} label={tw(lang, "help")} className={modalClass}>
        <HelpDialog lang={lang} onClose={() => setDialog(null)} />
      </Modal>
      <Modal open={dialog === "stats"} onClose={() => setDialog(null)} label={tw(lang, "stats")} className={modalClass}>
        <StatsDialog lang={lang} store={store} onClose={() => setDialog(null)} />
      </Modal>
      <Modal open={dialog === "settings"} onClose={() => setDialog(null)} label={tw(lang, "settings")} className={modalClass}>
        <SettingsDialog
          lang={lang}
          store={store}
          canEnableHard={!game || game.guesses.length === 0 || game.status !== "playing"}
          onChange={(changes) => commit((current) => ({ ...current, settings: { ...current.settings, ...changes } }))}
          onClose={() => setDialog(null)}
        />
      </Modal>
      <Modal open={dialog === "end"} onClose={() => setDialog(null)} label={game?.status === "won" ? tw(lang, "won") : tw(lang, "lost")} className={modalClass}>
        {game && <EndDialog lang={lang} game={game} store={store} onPlayAgain={startNewGame} onClose={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog === "confirm"} onClose={() => setDialog(null)} label={tw(lang, "giveUpTitle")} className={modalClass}>
        <div className="wd-dialog">
          <h2>{tw(lang, "giveUpTitle")}</h2>
          <p>{tw(lang, "giveUpText")}</p>
          <div className="wd-dialog-actions">
            <button type="button" className="wd-button wd-button-primary" onClick={startNewGame}>
              {tw(lang, "giveUp")}
            </button>
            <button type="button" className="wd-button" onClick={() => setDialog(null)}>
              {tw(lang, "keepPlaying")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="wd-icon-button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- board */

function Board({ lang, game, typed, revealed, revealing, shakeRow }: { lang: AppLang; game: GameState | undefined; typed: string; revealed: number; revealing: boolean; shakeRow: number | null }) {
  const guesses = game?.guesses ?? [];
  const rows = Array.from({ length: MAX_GUESSES }, (_, rowIndex) => {
    const guess = guesses[rowIndex];
    if (guess !== undefined && game) return { letters: Array.from(guess), evaluation: evaluateGuess(guess, game.answer), kind: "guess" as const };
    if (rowIndex === guesses.length && game?.status === "playing") return { letters: Array.from(typed), evaluation: null, kind: "typing" as const };
    return { letters: [] as string[], evaluation: null, kind: "empty" as const };
  });
  const justSubmitted = revealing ? guesses.length - 1 : -1;
  const wonRow = game?.status === "won" && !revealing && revealed === guesses.length ? guesses.length - 1 : -1;

  return (
    <div className="wd-board" role="grid" aria-label={tw(lang, "boardLabel")}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} role="row" className={cn("wd-row", shakeRow === rowIndex && "wd-shake", wonRow === rowIndex && "wd-won")}>
          {Array.from({ length: WORD_LENGTH }, (_, col) => {
            const letter = row.letters[col];
            const scored = row.kind === "guess" && rowIndex < revealed;
            const flipping = rowIndex === justSubmitted;
            const state = row.evaluation?.[col];
            const visibleState = scored || flipping ? state : undefined;
            const label =
              letter === undefined
                ? tw(lang, "tileEmptyLabel", { row: rowIndex + 1, col: col + 1 })
                : tw(lang, "tileLabel", {
                    row: rowIndex + 1,
                    col: col + 1,
                    letter: letter.toUpperCase(),
                    state: visibleState ? tw(lang, visibleState === "correct" ? "stateCorrect" : visibleState === "present" ? "statePresent" : "stateAbsent") : tw(lang, "stateTyping"),
                  });
            return (
              <div
                key={col}
                role="gridcell"
                aria-label={label}
                data-state={visibleState ?? (letter ? "typing" : "empty")}
                className={cn("wd-tile", flipping && "wd-flip", letter && "wd-filled")}
                style={flipping ? ({ "--wd-i": col } as React.CSSProperties) : undefined}
              >
                <span aria-hidden="true">{letter?.toUpperCase()}</span>
                {visibleState && !flipping && (
                  <span aria-hidden="true" className="wd-mark">
                    {visibleState === "correct" ? "✓" : visibleState === "present" ? "•" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- keyboard */

function Keyboard({
  lang,
  states,
  onLetter,
  onEnter,
  onBackspace,
  disabled,
}: {
  lang: AppLang;
  states: Record<string, LetterState>;
  onLetter: (letter: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  disabled: boolean;
}) {
  const rows = KEYBOARD_ROWS[lang];
  return (
    <div className="wd-keyboard" role="group" aria-label={tw(lang, "keyboardLabel")}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="wd-key-row">
          {rowIndex === rows.length - 1 && (
            <button type="button" className="wd-key wd-key-wide" onClick={onEnter} disabled={disabled}>
              {tw(lang, "enter")}
            </button>
          )}
          {row.map((letter) => {
            const state = states[letter];
            return (
              <button
                key={letter}
                type="button"
                className="wd-key"
                data-state={state ?? "unused"}
                aria-label={tw(lang, "keyLabel", {
                  letter: letter.toUpperCase(),
                  state: state ? tw(lang, state === "correct" ? "stateCorrect" : state === "present" ? "statePresent" : "stateAbsent") : tw(lang, "keyUnused"),
                })}
                onClick={() => onLetter(letter)}
                disabled={disabled}
              >
                {letter.toUpperCase()}
              </button>
            );
          })}
          {rowIndex === rows.length - 1 && (
            <button type="button" className="wd-key wd-key-wide" onClick={onBackspace} aria-label={tw(lang, "backspace")} disabled={disabled}>
              <Delete aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- dialogs */

function DialogShell({ lang, title, onClose, children }: { lang: AppLang; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="wd-dialog">
      <h2>{title}</h2>
      {children}
      <div className="wd-dialog-actions">
        <button type="button" className="wd-button" onClick={onClose}>
          {tw(lang, "close")}
        </button>
      </div>
    </div>
  );
}

function HelpDialog({ lang, onClose }: { lang: AppLang; onClose: () => void }) {
  const examples: { word: string; index: number; state: LetterState; text: string }[] =
    lang === "ru"
      ? [
          { word: "книга", index: 0, state: "correct", text: tw(lang, "helpExampleCorrect") },
          { word: "собор", index: 1, state: "present", text: tw(lang, "helpExamplePresent") },
          { word: "шапка", index: 0, state: "absent", text: tw(lang, "helpExampleAbsent") },
        ]
      : [
          { word: "world", index: 0, state: "correct", text: tw(lang, "helpExampleCorrect") },
          { word: "quiet", index: 2, state: "present", text: tw(lang, "helpExamplePresent") },
          { word: "plumb", index: 2, state: "absent", text: tw(lang, "helpExampleAbsent") },
        ];
  return (
    <DialogShell lang={lang} title={tw(lang, "help")} onClose={onClose}>
      <p>{tw(lang, "helpIntro")}</p>
      <ul className="wd-rules">
        <li>{tw(lang, "helpRule1")}</li>
        <li>{tw(lang, "helpRule2")}</li>
        <li>{tw(lang, "helpRule3")}</li>
      </ul>
      <div className="wd-examples">
        {examples.map((example) => (
          <div key={example.word} className="wd-example">
            <div className="wd-example-row" aria-hidden="true">
              {Array.from(example.word).map((letter, index) => (
                <div key={index} className="wd-tile wd-filled wd-small" data-state={index === example.index ? example.state : "typing"}>
                  {letter.toUpperCase()}
                </div>
              ))}
            </div>
            <p>{example.text}</p>
          </div>
        ))}
      </div>
    </DialogShell>
  );
}

function StatsBlock({ lang, store }: { lang: AppLang; store: WordleStore }) {
  const stats = store.stats[lang];
  const winRate = stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
  const max = Math.max(1, ...stats.distribution);
  return (
    <>
      <dl className="wd-stats">
        {(
          [
            ["statPlayed", stats.played],
            ["statWinRate", winRate],
            ["statStreak", stats.streak],
            ["statMaxStreak", stats.maxStreak],
          ] as const
        ).map(([key, value]) => (
          <div key={key}>
            <dd>{value}</dd>
            <dt>{tw(lang, key)}</dt>
          </div>
        ))}
      </dl>
      <h3 className="wd-subtitle">{tw(lang, "distribution")}</h3>
      {stats.played === 0 ? (
        <p className="wd-muted">{tw(lang, "noGamesYet")}</p>
      ) : (
        <ol className="wd-distribution">
          {stats.distribution.map((count, index) => (
            <li key={index} aria-label={tw(lang, "distributionRow", { n: index + 1, count })}>
              <span aria-hidden="true">{index + 1}</span>
              <span className="wd-bar" aria-hidden="true" style={{ width: `${Math.max(8, (count / max) * 100)}%` }}>
                {count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function StatsDialog({ lang, store, onClose }: { lang: AppLang; store: WordleStore; onClose: () => void }) {
  return (
    <DialogShell lang={lang} title={tw(lang, "stats")} onClose={onClose}>
      <StatsBlock lang={lang} store={store} />
    </DialogShell>
  );
}

function SettingsDialog({
  lang,
  store,
  canEnableHard,
  onChange,
  onClose,
}: {
  lang: AppLang;
  store: WordleStore;
  canEnableHard: boolean;
  onChange: (changes: Partial<WordleStore["settings"]>) => void;
  onClose: () => void;
}) {
  const { settings } = store;
  const hardLocked = !canEnableHard && !settings.hardMode;
  return (
    <DialogShell lang={lang} title={tw(lang, "settings")} onClose={onClose}>
      <ul className="wd-settings">
        <li>
          <label>
            <input type="checkbox" checked={settings.hardMode} disabled={hardLocked} onChange={(event) => onChange({ hardMode: event.target.checked })} aria-describedby="wd-hard-hint" />
            <span>{tw(lang, "hardMode")}</span>
          </label>
          <p id="wd-hard-hint" className="wd-muted">
            {tw(lang, "hardModeHint")}
          </p>
        </li>
        <li>
          <label>
            <input type="checkbox" checked={settings.highContrast} onChange={(event) => onChange({ highContrast: event.target.checked })} aria-describedby="wd-contrast-hint" />
            <span>{tw(lang, "highContrast")}</span>
          </label>
          <p id="wd-contrast-hint" className="wd-muted">
            {tw(lang, "highContrastHint")}
          </p>
        </li>
        <li>
          <label>
            <input type="checkbox" checked={settings.sound} onChange={(event) => onChange({ sound: event.target.checked })} />
            <span>{tw(lang, "sound")}</span>
          </label>
        </li>
      </ul>
    </DialogShell>
  );
}

function EndDialog({ lang, game, store, onPlayAgain, onClose }: { lang: AppLang; game: GameState; store: WordleStore; onPlayAgain: () => void; onClose: () => void }) {
  const [copied, setCopied] = React.useState<"idle" | "ok" | "failed">("idle");
  const won = game.status === "won";

  const share = async () => {
    const text = shareText(lang, game, { hardMode: store.settings.hardMode, highContrast: store.settings.highContrast });
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div className="wd-dialog">
      <h2>{won ? tw(lang, "won") : tw(lang, "lost")}</h2>
      <p>{won ? tw(lang, "wonIn", { n: game.guesses.length, max: MAX_GUESSES }) : tw(lang, "answerWas", { word: game.answer.toUpperCase() })}</p>
      <StatsBlock lang={lang} store={store} />
      <p role="status" className="wd-muted">
        {copied === "ok" ? tw(lang, "copied") : copied === "failed" ? tw(lang, "copyFailed") : ""}
      </p>
      <div className="wd-dialog-actions">
        <button type="button" className="wd-button wd-button-primary" onClick={onPlayAgain}>
          {tw(lang, "playAgain")}
        </button>
        <button type="button" className="wd-button" onClick={() => void share()}>
          {tw(lang, "share")}
        </button>
        <button type="button" className="wd-button" onClick={onClose}>
          {tw(lang, "close")}
        </button>
      </div>
    </div>
  );
}
