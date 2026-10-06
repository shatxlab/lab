import { Ban, Check, LogOut, Play, Timer } from "lucide-react";
import type { CSSProperties } from "react";

import { t } from "@/lib/alias/i18n";
import type { Lang, Team, ThemeDef, TurnWord } from "@/lib/alias/types";
import { Scoreboard, TimerRing } from "@/components/alias/parts";

interface ReadyScreenProps {
  lang: Lang;
  theme: ThemeDef;
  team: Team;
  teams: Team[];
  targetScore: number;
  onStart: () => void;
  onExit: () => void;
}

export function ReadyScreen({ lang, theme, team, teams, targetScore, onStart, onExit }: ReadyScreenProps) {
  return (
    <div
      className="alias-play alias-ready"
      style={{ background: theme.gradient } as CSSProperties}
    >
      <div className="alias-play-topbar">
        <button type="button" className="alias-ghost-button" onClick={onExit}>
          <LogOut aria-hidden="true" /> {t(lang, "exit")}
        </button>
        <span className="alias-play-theme">
          {theme.emoji} {theme.name[lang]}
        </span>
      </div>

      <div className="alias-ready-card">
        <p className="alias-ready-eyebrow">{t(lang, "getReady")}</p>
        <h2 className="alias-ready-team" style={{ "--team-color": team.color } as CSSProperties}>
          <span aria-hidden="true" />
          {t(lang, "readyTeam", { team: team.name })}
        </h2>
        <p className="alias-ready-hint">{t(lang, "readyHint")}</p>
        <p className="alias-ready-explainer">{t(lang, "explainerHint")}</p>

        <button type="button" className="alias-primary-button alias-start-round" onClick={onStart}>
          <Play aria-hidden="true" /> {t(lang, "startRound")}
        </button>

        <div className="alias-ready-score">
          <span className="alias-score-caption">
            <Timer aria-hidden="true" /> {t(lang, "scoreboard")}
          </span>
          <Scoreboard teams={teams} activeTeamId={team.id} />
          <span className="alias-score-target">
            {t(lang, "targetScore")} {targetScore} {t(lang, "pointsSuffix")}
          </span>
        </div>
      </div>
    </div>
  );
}

interface RoundScreenProps {
  lang: Lang;
  theme: ThemeDef;
  team: Team;
  word: string;
  remaining: number;
  total: number;
  words: readonly TurnWord[];
  /** True once the timer hit zero but the last word is still unresolved. */
  timeExpired?: boolean;
  onCorrect: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

export function RoundScreen({
  lang,
  theme,
  team,
  word,
  remaining,
  total,
  words,
  timeExpired = false,
  onCorrect,
  onSkip,
  onFinish,
}: RoundScreenProps) {
  const correct = words.filter((entry) => entry.correct).length;
  const skipped = words.length - correct;
  const urgent = remaining <= 5;
  const sizeClass = word.length > 20 ? "is-xlong" : word.length > 13 ? "is-long" : "";

  return (
    <div
      className={`alias-play alias-round${timeExpired ? " is-time-up" : ""}`}
      style={{ background: theme.gradient } as CSSProperties}
    >
      <div className="alias-round-topbar">
        <div className="alias-round-team" style={{ "--team-color": team.color } as CSSProperties}>
          <span aria-hidden="true" />
          <span className="alias-round-team-name">{team.name}</span>
        </div>
        <TimerRing remaining={remaining} total={total} urgent={urgent} />
        <button type="button" className="alias-ghost-button" onClick={onFinish}>
          {t(lang, "finishRound")}
        </button>
      </div>

      <div className="alias-word-stage">
        <div key={word} className={`alias-word-card ${sizeClass}`}>
          <span className="alias-word">{word}</span>
        </div>
      </div>

      <div className="alias-round-tally" aria-live="polite">
        <span className="alias-tally-correct">
          <Check aria-hidden="true" /> {correct}
        </span>
        <span className="alias-tally-skipped">
          <Ban aria-hidden="true" /> {skipped}
        </span>
      </div>

      <div className="alias-round-actions">
        <button type="button" className="alias-action alias-action-skip" onClick={onSkip}>
          <Ban aria-hidden="true" />
          <span>{t(lang, "skip")}</span>
        </button>
        <button type="button" className="alias-action alias-action-correct" onClick={onCorrect}>
          <Check aria-hidden="true" />
          <span>{t(lang, "correct")}</span>
        </button>
      </div>

      <p className={`alias-keyboard-hint${timeExpired ? " is-time-up" : ""}`} role="status">
        {timeExpired ? t(lang, "timeUpHint") : t(lang, "keyboardHint")}
      </p>
    </div>
  );
}
