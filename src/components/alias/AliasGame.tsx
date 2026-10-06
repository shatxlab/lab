import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { t } from "@/lib/alias/i18n";
import {
  applyPoints,
  createTeamId,
  defaultSettings,
  defaultTeamName,
  defaultTeams,
  isRoundComplete,
  makeTeam,
  nextTeam as makeNextTeam,
  resolveWinner,
  turnPoints,
  TEAM_COLORS,
} from "@/lib/alias/game";
import { advanceDeck, createDeck, refillDeck } from "@/lib/alias/deck";
import { poolFor } from "@/lib/alias/words";
import { getTheme } from "@/lib/alias/themes";
import { createSoundEngine, type SoundEngine } from "@/lib/alias/sound";
import { readAliasState, writeAliasState } from "@/lib/alias/storage";
import { readAppLang, subscribeToAppLang } from "@/lib/apps/lang";
import { useLangReady } from "@/lib/apps/use-app-lang";
import type { AliasSettings, Phase, Team, TurnResult, TurnWord } from "@/lib/alias/types";

import { SetupScreen } from "./SetupScreen";
import { ReadyScreen, RoundScreen } from "./PlayScreens";
import { ResultsScreen } from "./ResultsScreen";

export default function AliasGame() {
  const readyRef = useLangReady<HTMLDivElement>();
  const [settings, setSettings] = useState<AliasSettings>(() => defaultSettings());
  const [teams, setTeams] = useState<Team[]>(() => defaultTeams(readAppLang()));
  const [phase, setPhase] = useState<Phase>("setup");
  const [activeIndex, setActiveIndex] = useState(0);
  const [deck, setDeck] = useState<string[]>([]);
  const [words, setWords] = useState<TurnWord[]>([]);
  const [remaining, setRemaining] = useState(60);
  // The clock has run out, but the on-screen word stays until it is resolved.
  const [timeExpired, setTimeExpired] = useState(false);
  const [lastResult, setLastResult] = useState<TurnResult | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const deadlineRef = useRef(0);
  const roundActiveRef = useRef(false);
  const soundRef = useRef<SoundEngine | null>(null);
  // Every word already shown this game; refilled decks exclude them.
  const usedWordsRef = useRef<Set<string>>(new Set());
  if (!soundRef.current) soundRef.current = createSoundEngine(settings.sound);

  const pool = useMemo(() => poolFor(settings.lang, settings.themeId), [settings.lang, settings.themeId]);
  const theme = getTheme(settings.themeId);
  const activeTeam = teams[activeIndex] ?? teams[0];
  const winner = winnerId ? teams.find((team) => team.id === winnerId) ?? null : null;

  // Restore the saved setup once, after mount (SSR has no localStorage). The
  // shared header language setting wins over whatever the game last stored.
  useEffect(() => {
    const lang = readAppLang();
    const stored = readAliasState();
    if (stored) {
      setSettings({ ...stored.settings, lang });
      setTeams(
        stored.teams.length >= 2
          ? stored.teams.map((team, index) => {
              // Default names created in the old language follow the new one.
              const name =
                team.name === defaultTeamName(stored.settings.lang, index)
                  ? defaultTeamName(lang, index)
                  : team.name;
              return makeTeam(createTeamId(), name, team.color || TEAM_COLORS[index % TEAM_COLORS.length]);
            })
          : defaultTeams(lang),
      );
    } else {
      setSettings((current) => ({ ...current, lang }));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    soundRef.current?.setEnabled(settings.sound);
  }, [settings.sound]);

  // Follow the shared header language setting; default team names follow it.
  const settingsLangRef = useRef(settings.lang);
  settingsLangRef.current = settings.lang;
  useEffect(
    () =>
      subscribeToAppLang((nextLang) => {
        setSettings((prev) => ({ ...prev, lang: nextLang }));
        setTeams((current) =>
          current.map((team, index) => {
            const wasDefault =
              team.name === defaultTeamName(settingsLangRef.current, index) ||
              team.name === defaultTeamName(nextLang, index);
            return wasDefault ? { ...team, name: defaultTeamName(nextLang, index) } : team;
          }),
        );
        settingsLangRef.current = nextLang;
      }),
    [],
  );

  // Persist the setup (but never the in-progress scores).
  useEffect(() => {
    if (!hydrated) return;
    writeAliasState({
      settings,
      teams: teams.map(({ name, color }) => ({ name, color })),
    });
  }, [settings, teams, hydrated]);

  const endRound = useCallback(
    (overrideWords?: TurnWord[]) => {
      if (!roundActiveRef.current) return;
      roundActiveRef.current = false;
      const used = overrideWords ?? words;
      const points = turnPoints(used, settings.skipPenalty);
      const updatedTeams = teams.map((team, index) =>
        index === activeIndex ? applyPoints(team, points) : team,
      );
      setTeams(updatedTeams);
      setLastResult({ teamId: teams[activeIndex].id, words: used, points });

      // The target only ends the game once the round is complete, so every
      // team gets the same number of turns and the highest score wins.
      const champion = isRoundComplete(activeIndex, teams.length)
        ? resolveWinner(updatedTeams, settings.targetScore)
        : null;
      if (champion) {
        setWinnerId(champion.id);
        setPhase("gameOver");
        soundRef.current?.play("win");
      } else {
        setPhase("turnResults");
      }
    },
    [words, teams, activeIndex, settings.skipPenalty, settings.targetScore],
  );

  // Countdown driven by rAF so it stays accurate even if the tab is throttled.
  useEffect(() => {
    if (phase !== "playing") return undefined;
    let frame = 0;
    let lastWhole = -1;
    const step = () => {
      const left = Math.max(0, (deadlineRef.current - Date.now()) / 1000);
      setRemaining(left);
      const whole = Math.ceil(left);
      if (whole !== lastWhole && whole <= 5 && whole > 0) {
        lastWhole = whole;
        soundRef.current?.play(whole <= 3 ? "urgent" : "tick");
      }
      if (left <= 0) {
        // Keep the current word on screen; the player must still mark it.
        setRemaining(0);
        setTimeExpired(true);
        soundRef.current?.play("timeUp");
        return;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  const handleSettingsChange = useCallback(
    (partial: Partial<AliasSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
      if (partial.lang && partial.lang !== settings.lang) {
        const nextLang = partial.lang;
        setTeams((current) =>
          current.map((team, index) => {
            const wasDefault =
              team.name === defaultTeamName(settings.lang, index) ||
              team.name === defaultTeamName(nextLang, index);
            return wasDefault ? { ...team, name: defaultTeamName(nextLang, index) } : team;
          }),
        );
      }
    },
    [settings.lang],
  );

  const handleRenameTeam = useCallback((id: string, name: string) => {
    setTeams((current) => current.map((team) => (team.id === id ? { ...team, name } : team)));
  }, []);

  const handleAddTeam = useCallback(() => {
    setTeams((current) => [...current, makeNextTeam(settings.lang, current)]);
  }, [settings.lang]);

  const handleRemoveTeam = useCallback((id: string) => {
    setTeams((current) => (current.length <= 2 ? current : current.filter((team) => team.id !== id)));
  }, []);

  const resetScores = useCallback(
    (current: Team[]) => current.map((team) => ({ ...team, score: 0 })),
    [],
  );

  const beginGame = useCallback(() => {
    soundRef.current?.resume();
    soundRef.current?.play("start");
    roundActiveRef.current = false;
    setTeams((current) => resetScores(current));
    setActiveIndex(0);
    setWords([]);
    setLastResult(null);
    setWinnerId(null);
    usedWordsRef.current = new Set();
    setDeck(createDeck(poolFor(settings.lang, settings.themeId)));
    setPhase("ready");
  }, [resetScores, settings.lang, settings.themeId]);

  const startRound = useCallback(() => {
    soundRef.current?.resume();
    soundRef.current?.play("start");
    setDeck((current) =>
      refillDeck(current, poolFor(settings.lang, settings.themeId), usedWordsRef.current),
    );
    setWords([]);
    setLastResult(null);
    setTimeExpired(false);
    setRemaining(settings.roundSeconds);
    deadlineRef.current = Date.now() + settings.roundSeconds * 1000;
    roundActiveRef.current = true;
    setPhase("playing");
  }, [settings.lang, settings.themeId, settings.roundSeconds]);

  const handleCorrect = useCallback(() => {
    if (phase !== "playing" || !roundActiveRef.current) return;
    const word = deck[0];
    if (!word) return;
    usedWordsRef.current.add(word);
    const nextWords: TurnWord[] = [...words, { word, correct: true }];
    soundRef.current?.play("correct");
    setWords(nextWords);
    setDeck((current) => refillDeck(advanceDeck(current), pool, usedWordsRef.current));
    // A team keeps playing its full turn even after passing the target: the
    // game only ends at the end of the round, so extra points still matter.
    if (timeExpired) endRound(nextWords);
  }, [
    phase,
    deck,
    words,
    pool,
    timeExpired,
    endRound,
  ]);

  const handleSkip = useCallback(() => {
    if (phase !== "playing" || !roundActiveRef.current) return;
    const word = deck[0];
    if (!word) return;
    usedWordsRef.current.add(word);
    const nextWords: TurnWord[] = [...words, { word, correct: false }];
    soundRef.current?.play("skip");
    setWords(nextWords);
    setDeck((current) => refillDeck(advanceDeck(current), pool, usedWordsRef.current));
    if (timeExpired) endRound(nextWords);
  }, [phase, deck, words, pool, timeExpired, endRound]);

  // Leaving early also retires the on-screen word so it never repeats later.
  const handleFinish = useCallback(() => {
    if (phase !== "playing" || !roundActiveRef.current) return;
    const word = deck[0];
    if (word) {
      usedWordsRef.current.add(word);
      setDeck((current) => refillDeck(advanceDeck(current), pool, usedWordsRef.current));
    }
    endRound();
  }, [phase, deck, pool, endRound]);

  // Fix a word's result from the results list (e.g. it was guessed but the
  // explainer tapped skip). Recomputes the turn points, adjusts the team's
  // score by the difference, and re-checks whether the game is over.
  const handleToggleWord = useCallback(
    (index: number) => {
      if (!lastResult) return;
      const nextWords = lastResult.words.map((entry, i) =>
        i === index ? { ...entry, correct: !entry.correct } : entry,
      );
      const points = turnPoints(nextWords, settings.skipPenalty);
      const delta = points - lastResult.points;
      const updatedTeams = teams.map((team) =>
        team.id === lastResult.teamId ? applyPoints(team, delta) : team,
      );
      // Only a completed round can produce a winner; mid-round corrections
      // just update the score and the game continues.
      const champion = isRoundComplete(activeIndex, teams.length)
        ? resolveWinner(updatedTeams, settings.targetScore)
        : null;
      setTeams(updatedTeams);
      setLastResult({ ...lastResult, words: nextWords, points });
      setWinnerId(champion ? champion.id : null);
      setPhase(champion ? "gameOver" : "turnResults");
    },
    [lastResult, teams, activeIndex, settings.skipPenalty, settings.targetScore],
  );

  const handleNextTeam = useCallback(() => {
    roundActiveRef.current = false;
    setActiveIndex((index) => (teams.length === 0 ? 0 : (index + 1) % teams.length));
    setWords([]);
    setLastResult(null);
    setPhase("ready");
  }, [teams.length]);

  const handlePlayAgain = useCallback(() => {
    beginGame();
  }, [beginGame]);

  const handleSetup = useCallback(() => {
    roundActiveRef.current = false;
    setWinnerId(null);
    setLastResult(null);
    setWords([]);
    setPhase("setup");
  }, []);

  // Keyboard shortcuts: Space/Enter/→ guessed, Backspace/↓ skip.
  useEffect(() => {
    if (phase !== "playing") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.code === "Space" || event.code === "Enter" || event.code === "ArrowRight") {
        event.preventDefault();
        handleCorrect();
      } else if (event.code === "Backspace" || event.code === "ArrowDown") {
        event.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, handleCorrect, handleSkip]);

  const requestExit = useCallback(() => setConfirmExit(true), []);
  const cancelExit = useCallback(() => setConfirmExit(false), []);
  const confirmExitNow = useCallback(() => {
    setConfirmExit(false);
    handleSetup();
    setTeams((current) => resetScores(current));
  }, [handleSetup, resetScores]);

  const currentWord = deck[0] ?? "";

  return (
    <div ref={readyRef} data-lang-sensitive="" className="alias-shell" data-phase={phase}>
      {phase === "setup" ? (
        <SetupScreen
          settings={settings}
          teams={teams}
          deckCount={pool.length}
          onChange={handleSettingsChange}
          onRenameTeam={handleRenameTeam}
          onAddTeam={handleAddTeam}
          onRemoveTeam={handleRemoveTeam}
          onStart={beginGame}
        />
      ) : null}

      {phase === "ready" && activeTeam ? (
        <ReadyScreen
          lang={settings.lang}
          theme={theme}
          team={activeTeam}
          teams={teams}
          targetScore={settings.targetScore}
          onStart={startRound}
          onExit={requestExit}
        />
      ) : null}

      {phase === "playing" && activeTeam ? (
        <RoundScreen
          lang={settings.lang}
          theme={theme}
          team={activeTeam}
          word={currentWord}
          remaining={remaining}
          total={settings.roundSeconds}
          words={words}
          timeExpired={timeExpired}
          onCorrect={handleCorrect}
          onSkip={handleSkip}
          onFinish={handleFinish}
        />
      ) : null}

      {(phase === "turnResults" || phase === "gameOver") && lastResult && activeTeam ? (
        <ResultsScreen
          lang={settings.lang}
          theme={theme}
          teams={teams}
          result={lastResult}
          team={activeTeam}
          targetScore={settings.targetScore}
          isGameOver={phase === "gameOver"}
          winner={winner}
          onNext={handleNextTeam}
          onPlayAgain={handlePlayAgain}
          onSetup={handleSetup}
          onToggleWord={handleToggleWord}
        />
      ) : null}

      {confirmExit ? (
        <div className="alias-modal" role="dialog" aria-modal="true" aria-label={t(settings.lang, "confirmExit")}>
          <div className="alias-modal-card">
            <h2>{t(settings.lang, "confirmExit")}</h2>
            <p>{t(settings.lang, "confirmExitBody")}</p>
            <div className="alias-modal-actions">
              <button type="button" className="alias-secondary-button" onClick={cancelExit}>
                {t(settings.lang, "cancel")}
              </button>
              <button type="button" className="alias-danger-button" onClick={confirmExitNow}>
                {t(settings.lang, "confirm")}
              </button>
            </div>
            <button
              type="button"
              className="alias-modal-close"
              onClick={cancelExit}
              aria-label={t(settings.lang, "close")}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
