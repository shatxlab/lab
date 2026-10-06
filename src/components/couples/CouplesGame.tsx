import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { stringsFor } from "@/lib/couples/i18n";
import { dealSession, redealSession, type Session } from "@/lib/couples/deck";
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
import type { CouplesQuestion, CouplesSettings, GameId, PlayPhase, RoundResult } from "@/lib/couples/types";

import { MenuScreen } from "./MenuScreen";
import { SetupScreen } from "./SetupScreen";
import { PlayScreen } from "./PlayScreen";
import { SummaryScreen } from "./SummaryScreen";

type Screen = "menu" | "setup" | "play" | "summary";

const EMPTY_STATS: CouplesStats = { games: 0, cards: 0, matches: 0 };

export default function CouplesGame() {
  const [settings, setSettings] = useState<CouplesSettings>(() => defaultSettings());
  const [stats, setStats] = useState<CouplesStats>(EMPTY_STATS);
  const [screen, setScreen] = useState<Screen>("menu");
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<PlayPhase>("voteA");
  const [votes, setVotes] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [results, setResults] = useState<RoundResult[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [hydrated, setHydrated] = useState(false);

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

  const pool = useMemo(
    () => questionsFor(settings.game, settings.theme, settings.lang),
    [settings.game, settings.theme, settings.lang],
  );

  const question = session?.cards[index] ?? null;
  const options = question
    ? resolveOptions(question, settings.names)
    : (["", ""] as [string, string]);

  const updateSettings = useCallback((partial: Partial<CouplesSettings>) => {
    setSettings((current) => ({ ...current, ...partial }));
  }, []);

  const beginSession = useCallback(
    (source: CouplesQuestion[], resetSeen: boolean) => {
      soundRef.current?.resume();
      soundRef.current?.play("tap");
      if (resetSeen) seenRef.current = new Set();
      const next = dealSession(source, settings.count);
      for (const card of next.cards) seenRef.current.add(card.id);
      setSession(next);
      setIndex(0);
      setVotes({ a: null, b: null });
      setResults([]);
      setPhase(settings.mode === "match" ? "voteA" : "voteTogether");
      setScreen("play");
    },
    [settings.count, settings.mode],
  );

  const startSession = useCallback(() => {
    setSettings((current) => ({ ...current, names: effectiveNames(current.names, current.lang) }));
    beginSession(pool, true);
  }, [pool, beginSession]);

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
      if (!question) return;

      if (phase === "voteA") {
        soundRef.current?.play("tap");
        setVotes((current) => ({ ...current, a: choice }));
        setPhase("handoff");
        return;
      }

      if (phase === "voteB") {
        const a = votes.a ?? 0;
        const match = a === choice;
        soundRef.current?.play(match ? "match" : "miss");
        setVotes((current) => ({ ...current, b: choice }));
        setResults((current) => [...current, { question, picks: [a, choice], match }]);
        setPhase("reveal");
        return;
      }

      if (phase === "voteTogether") {
        soundRef.current?.play("tap");
        const nextResults: RoundResult[] = [...results, { question, picks: [choice], match: true }];
        setVotes({ a: choice, b: null });
        setResults(nextResults);
        // Together mode has nothing to reveal: the choice was just made on
        // screen, so advance immediately (or wrap up on the last card).
        if (!session || index + 1 >= session.cards.length) {
          finish(nextResults);
        } else {
          setIndex((current) => current + 1);
          setVotes({ a: null, b: null });
        }
      }
    },
    [phase, question, votes.a, results, session, index, finish],
  );

  const next = useCallback(() => {
    if (!session) return;
    if (index + 1 >= session.cards.length) {
      finish();
      return;
    }
    setIndex((current) => current + 1);
    setVotes({ a: null, b: null });
    setPhase(settings.mode === "match" ? "voteA" : "voteTogether");
  }, [session, index, settings.mode, finish]);

  const playAgain = useCallback(() => {
    const nextSession = redealSession(pool, settings.count, seenRef.current);
    const exhausted = nextSession.cards.length < settings.count && seenRef.current.size >= pool.length;
    if (exhausted) seenRef.current = new Set();
    for (const card of nextSession.cards) seenRef.current.add(card.id);
    soundRef.current?.resume();
    soundRef.current?.play("tap");
    setSession(nextSession);
    setIndex(0);
    setVotes({ a: null, b: null });
    setResults([]);
    setPhase(settings.mode === "match" ? "voteA" : "voteTogether");
    setScreen("play");
  }, [pool, settings.count, settings.mode]);

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

  // Keyboard: 1/2 pick, Space/Enter advances.
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
      } else if (phase === "reveal") {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          next();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, phase, vote, pass, next]);

  const T = stringsFor(settings.lang);
  return (
    <div className="cp-shell" data-phase={phase}>
      {screen === "menu" ? (
        <MenuScreen lang={settings.lang} stats={stats} onPick={pickGame} />
      ) : null}

      {screen === "setup" ? (
        <SetupScreen
          settings={settings}
          onChange={updateSettings}
          onStart={startSession}
          onBack={toMenu}
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
          votes={votes}
          soundOn={settings.sound}
          onVote={vote}
          onPass={pass}
          onNext={next}
          onExit={requestExit}
          onToggleSound={() => updateSettings({ sound: !settings.sound })}
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