import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { stringsFor } from "@/lib/couples/i18n";
import { dealSession, redealSession, type Session } from "@/lib/couples/deck";
import {
  cardKey,
  emptyHistory,
  hideCard,
  markSeen,
  rankOf,
  readHistory,
  restoreHidden,
  withoutHidden,
  writeHistory,
  type CouplesHistory,
} from "@/lib/couples/history";
import { questionsFor, resolveOptions } from "@/lib/couples/questions";
import { createCouplesSoundEngine, type CouplesSoundEngine } from "@/lib/couples/sound";
import {
  DEFAULT_NAMES,
  defaultSettings,
  effectiveNames,
  readCouplesState,
  withSessionStats,
  writeCouplesState,
  type CouplesStats,
} from "@/lib/couples/storage";
import { readAppLang, subscribeToAppLang } from "@/lib/apps/lang";
import { useLangReady } from "@/lib/apps/use-app-lang";
import type { CouplesQuestion, CouplesSettings, GameId, Mode, PlayPhase, RoundResult } from "@/lib/couples/types";

import { MenuScreen } from "./MenuScreen";
import { SetupScreen } from "./SetupScreen";
import { PlayScreen } from "./PlayScreen";
import { SummaryScreen } from "./SummaryScreen";

type Screen = "menu" | "setup" | "play" | "summary";

const EMPTY_STATS: CouplesStats = { games: 0, cards: 0, matches: 0 };

/** Where a fresh run starts: match mode opens with the first partner's card, together mode with the shared one. */
function firstPhase(mode: Mode): PlayPhase {
  return mode === "match" ? "voteA" : "voteTogether";
}

/** Writes `choice` at `position`, so a repeated tap can never shift the answers after it. */
function withPick(picks: readonly number[], position: number, choice: number): number[] {
  const next = picks.slice(0, position);
  next[position] = choice;
  return next;
}

export default function CouplesGame() {
  const readyRef = useLangReady<HTMLDivElement>();
  // Prerendered in English, the site default: the pre-paint guard only hides the island for another stored
  // language, so an English visitor must not get a Russian first paint.
  const [settings, setSettings] = useState<CouplesSettings>(() => defaultSettings("en"));
  const [stats, setStats] = useState<CouplesStats>(EMPTY_STATS);
  const [screen, setScreen] = useState<Screen>("menu");
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<PlayPhase>("voteA");
  // Match mode: each partner's option for every card, by card position. The first partner
  // fills picksA for all cards, then the second partner fills picksB for the same cards.
  const [picksA, setPicksA] = useState<number[]>([]);
  const [picksB, setPicksB] = useState<number[]>([]);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [history, setHistory] = useState<CouplesHistory>(() => emptyHistory());
  const historyRef = useRef(history);
  historyRef.current = history;

  const soundRef = useRef<CouplesSoundEngine | null>(null);
  if (!soundRef.current) soundRef.current = createCouplesSoundEngine(settings.sound);
  const seenRef = useRef<Set<string>>(new Set());

  // Restore the saved setup once, after mount (SSR has no localStorage). The
  // shared header language setting wins over whatever the game last stored.
  useEffect(() => {
    const lang = readAppLang();
    const stored = readCouplesState();
    if (stored) {
      setSettings({ ...stored.settings, lang });
      setStats(stored.stats);
      soundRef.current?.setEnabled(stored.settings.sound);
    } else {
      setSettings((current) => ({ ...current, lang }));
    }
    setHistory(readHistory());
    setHydrated(true);
  }, []);

  // Follow the shared header language setting; default partner names follow it.
  useEffect(
    () =>
      subscribeToAppLang((nextLang) => {
        setSettings((current) => {
          const previousLang = current.lang;
          const swappedDefaults: [string, string] = [
            current.names[0] === DEFAULT_NAMES[previousLang][0]
              ? DEFAULT_NAMES[nextLang][0]
              : current.names[0],
            current.names[1] === DEFAULT_NAMES[previousLang][1]
              ? DEFAULT_NAMES[nextLang][1]
              : current.names[1],
          ];
          return { ...current, lang: nextLang, names: swappedDefaults };
        });
      }),
    [],
  );

  useEffect(() => {
    soundRef.current?.setEnabled(settings.sound);
  }, [settings.sound]);

  useEffect(() => {
    if (!hydrated) return;
    writeCouplesState({ settings, stats });
  }, [settings, stats, hydrated]);

  useEffect(() => {
    if (hydrated) writeHistory(history);
  }, [history, hydrated]);

  // Cards the couple turned off never come back; what is left is dealt unseen-first.
  const pool = useMemo(
    () => withoutHidden(questionsFor(settings.game, settings.theme, settings.lang), history),
    [settings.game, settings.theme, settings.lang, history],
  );

  const question = session?.cards[index] ?? null;
  const options = question
    ? resolveOptions(question, settings.names)
    : (["", ""] as [string, string]);

  const updateSettings = useCallback((partial: Partial<CouplesSettings>) => {
    setSettings((current) => ({ ...current, ...partial }));
  }, []);

  const startRun = useCallback(
    (next: Session) => {
      setSession(next);
      setIndex(0);
      setPicksA([]);
      setPicksB([]);
      setResults([]);
      setPhase(firstPhase(settings.mode));
      setScreen("play");
    },
    [settings.mode],
  );

  const beginSession = useCallback(
    (source: CouplesQuestion[], resetSeen: boolean) => {
      soundRef.current?.resume();
      soundRef.current?.play("tap");
      if (resetSeen) seenRef.current = new Set();
      const next = dealSession(source, settings.count, Math.random, rankOf(historyRef.current));
      for (const card of next.cards) seenRef.current.add(card.id);
      startRun(next);
    },
    [settings.count, startRun],
  );

  const startSession = useCallback(() => {
    setSettings((current) => ({ ...current, names: effectiveNames(current.names, current.lang) }));
    beginSession(pool, true);
  }, [pool, beginSession]);

  // A card counts as seen once it is on screen, not when it was dealt, so leaving
  // a game early does not use up the cards that never came up.
  const shownKey = screen === "play" && question ? cardKey(question) : null;
  useEffect(() => {
    if (shownKey) setHistory((current) => markSeen(current, shownKey));
  }, [shownKey]);

  const finish = useCallback(
    (finalResults: RoundResult[] = results) => {
      const scored = settings.mode === "match";
      const played = scored ? finalResults.length : 0;
      const matched = scored ? finalResults.filter((result) => result.match).length : 0;
      setStats((current) => withSessionStats(current, played, matched));
      soundRef.current?.play("finish");
      setScreen("summary");
    },
    [results, settings.mode],
  );

  const pass = useCallback(() => {
    soundRef.current?.play("pass");
    setPhase("voteB");
  }, []);

  const vote = useCallback(
    (choice: number) => {
      if (!session || !question) return;

      if (phase === "voteA") {
        soundRef.current?.play("tap");
        setPicksA((current) => withPick(current, index, choice));
        if (index + 1 < session.cards.length) {
          setIndex(index + 1);
        } else {
          // The first partner has answered every card: hand the phone over. The second one starts from the first card.
          setIndex(0);
          setPhase("handoff");
        }
        return;
      }

      if (phase === "voteB") {
        soundRef.current?.play("tap");
        const nextB = withPick(picksB, index, choice);
        if (index + 1 < session.cards.length) {
          setPicksB(nextB);
          setIndex(index + 1);
          return;
        }
        // Both partners have answered every card: the summary gets one row per card.
        const finalResults: RoundResult[] = session.cards.map((card, position) => {
          const a = picksA[position] ?? 0;
          const b = nextB[position] ?? 0;
          return { question: card, picks: [a, b], match: a === b };
        });
        setPicksB(nextB);
        setResults(finalResults);
        finish(finalResults);
        return;
      }

      if (phase === "voteTogether") {
        soundRef.current?.play("tap");
        const nextResults: RoundResult[] = [...results, { question, picks: [choice], match: true }];
        setResults(nextResults);
        // Together mode has nothing to reveal: the choice was just made on
        // screen, so advance immediately (or wrap up on the last card).
        if (index + 1 >= session.cards.length) {
          finish(nextResults);
        } else {
          setIndex(index + 1);
        }
      }
    },
    [phase, question, session, index, picksA, picksB, results, finish],
  );

  const playAgain = useCallback(() => {
    const nextSession = redealSession(pool, settings.count, seenRef.current, Math.random, rankOf(historyRef.current));
    const exhausted = nextSession.cards.length < settings.count && seenRef.current.size >= pool.length;
    if (exhausted) seenRef.current = new Set();
    for (const card of nextSession.cards) seenRef.current.add(card.id);
    soundRef.current?.resume();
    soundRef.current?.play("tap");
    startRun(nextSession);
  }, [pool, settings.count, startRun]);

  const hideCurrent = useCallback(() => {
    if (!question || !session) return;
    soundRef.current?.play("tap");
    const key = cardKey(question);
    setHistory((current) => hideCard(current, key));
    // Only a card nobody has answered yet can be swapped. Once the first partner has answered it, the card
    // stays for the rest of this run and is just turned off for the future.
    if (phase !== "voteA" && phase !== "voteTogether") return;
    const inSession = new Set(session.cards.map((card) => card.id));
    const candidates = pool.filter((card) => !inSession.has(card.id) && cardKey(card) !== key);
    const [replacement] = dealSession(candidates, 1, Math.random, rankOf(historyRef.current)).cards;
    if (replacement) {
      seenRef.current.add(replacement.id);
      setSession({ ...session, cards: session.cards.map((card, position) => (position === index ? replacement : card)) });
      return;
    }
    const remaining = session.cards.filter((_, position) => position !== index);
    setSession({ ...session, cards: remaining });
    // A later card slid into this slot, so the run goes on as before.
    if (index < remaining.length) return;
    if (phase === "voteTogether") {
      finish(results);
      return;
    }
    // The first partner had nothing left to answer after this card: hand over, or wrap up if nothing is left.
    if (remaining.length > 0) {
      setIndex(0);
      setPhase("handoff");
      return;
    }
    finish([]);
  }, [question, session, phase, pool, index, results, finish]);

  const pickGame = useCallback((game: GameId) => {
    setSettings((current) => ({ ...current, game }));
    setScreen("setup");
  }, []);

  const toMenu = useCallback(() => {
    setSession(null);
    setScreen("menu");
  }, []);

  const requestExit = useCallback(() => setConfirmExit(true), []);
  const cancelExit = useCallback(() => setConfirmExit(false), []);
  const confirmExitNow = useCallback(() => {
    setConfirmExit(false);
    setSession(null);
    setScreen("menu");
  }, []);

  // Keyboard: 1/2 pick an answer, Space/Enter passes the phone.
  useEffect(() => {
    if (screen !== "play") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (phase === "voteA" || phase === "voteB" || phase === "voteTogether") {
        if (event.key === "1") vote(0);
        else if (event.key === "2") vote(1);
      } else if (phase === "handoff") {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          pass();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, phase, vote, pass]);

  const T = stringsFor(settings.lang);
  return (
    <div ref={readyRef} data-lang-sensitive="" className="cp-shell" data-phase={phase}>
      {screen === "menu" ? (
        <MenuScreen lang={settings.lang} stats={stats} onPick={pickGame} />
      ) : null}

      {screen === "setup" ? (
        <SetupScreen
          settings={settings}
          onChange={updateSettings}
          onStart={startSession}
          onBack={toMenu}
          history={history}
          onRestoreHidden={() => setHistory((current) => restoreHidden(current))}
        />
      ) : null}

      {screen === "play" && question ? (
        <PlayScreen
          settings={settings}
          question={question}
          options={options}
          index={index}
          total={session?.cards.length ?? 0}
          phase={phase}
          soundOn={settings.sound}
          onVote={vote}
          onPass={pass}
          onExit={requestExit}
          onToggleSound={() => updateSettings({ sound: !settings.sound })}
          onHide={hideCurrent}
          hidden={history.hidden.includes(cardKey(question))}
        />
      ) : null}

      {screen === "summary" ? (
        <SummaryScreen
          settings={settings}
          results={results}
          onPlayAgain={playAgain}
          onSettings={() => setScreen("setup")}
          onMenu={toMenu}
        />
      ) : null}

      {confirmExit ? (
        <div className="cp-modal" role="dialog" aria-modal="true" aria-label={T.confirmExit}>
          <div className="cp-modal-card">
            <h2>{T.confirmExit}</h2>
            <p>{T.confirmExitBody}</p>
            <div className="cp-modal-actions">
              <button type="button" className="cp-secondary" onClick={cancelExit}>
                {T.cancel}
              </button>
              <button type="button" className="cp-danger" onClick={confirmExitNow}>
                {T.confirm}
              </button>
            </div>
            <button type="button" className="cp-modal-close" onClick={cancelExit} aria-label={T.close}>
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}