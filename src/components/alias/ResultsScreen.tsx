import { ChevronRight, RotateCcw, Settings, Trophy } from "lucide-react";
import type { CSSProperties } from "react";

import { t } from "@/lib/alias/i18n";
import type { Lang, Team, ThemeDef, TurnResult } from "@/lib/alias/types";
import { Scoreboard, WordChip } from "@/components/alias/parts";

interface ResultsScreenProps {
  lang: Lang;
  theme: ThemeDef;
  teams: Team[];
  result: TurnResult;
  team: Team;
  targetScore: number;
  isGameOver: boolean;
  winner: Team | null;
  onNext: () => void;
  onPlayAgain: () => void;
  onSetup: () => void;
  onToggleWord: (index: number) => void;
}

export function ResultsScreen({
  lang,
  theme,
  teams,
  result,
  team,
  targetScore,
  isGameOver,
  winner,
  onNext,
  onPlayAgain,
  onSetup,
  onToggleWord,
}: ResultsScreenProps) {
  const correct = result.words.filter((entry) => entry.correct).length;
  const skipped = result.words.length - correct;
  const sign = result.points > 0 ? "+" : "";
  const targetReached = !isGameOver && teams.some((entry) => entry.score >= targetScore);

  return (
    <div className="alias-play alias-results" style={{ background: theme.gradient } as CSSProperties}>
      <div className="alias-results-scroll">
        {isGameOver ? (
          <header className="alias-results-head">
            <span className="alias-trophy" aria-hidden="true">
              <Trophy />
            </span>
            <p className="alias-results-eyebrow">{t(lang, "gameOver")}</p>
            <h2 className="alias-results-title">
              {winner ? t(lang, "winner", { team: winner.name }) : t(lang, "gameOver")}
            </h2>
          </header>
        ) : (
          <header className="alias-results-head">
            <p className="alias-results-eyebrow">{t(lang, "roundOver")}</p>
            <h2 className="alias-results-title" style={{ "--team-color": team.color } as CSSProperties}>
              {team.name}
            </h2>
          </header>
        )}

        {targetReached ? (
          <p className="alias-target-hit" role="status">
            {t(lang, "targetReachedHint")}
          </p>
        ) : null}

        <div className="alias-result-score">
          <div className="alias-result-stat is-correct">
            <span>{t(lang, "guessed")}</span>
            <strong>{correct}</strong>
          </div>
          <div className="alias-result-stat is-skipped">
            <span>{t(lang, "skipped")}</span>
            <strong>{skipped}</strong>
          </div>
          <div className="alias-result-stat is-points">
            <span>{t(lang, "turnPoints")}</span>
            <strong>
              {sign}
              {result.points}
            </strong>
          </div>
        </div>

        <section className="alias-result-words" aria-label={t(lang, "turnPoints")}>
          {result.words.length === 0 ? (
            <p className="alias-empty">{t(lang, "noWords")}</p>
          ) : (
            <>
              <ul>
                {result.words.map((entry, index) => (
                  <WordChip
                    key={`${entry.word}-${index}`}
                    word={entry.word}
                    correct={entry.correct}
                    onToggle={() => onToggleWord(index)}
                    toggleLabel={entry.correct ? t(lang, "markSkipped") : t(lang, "markCorrect")}
                  />
                ))}
              </ul>
              <p className="alias-words-hint">{t(lang, "editWordsHint")}</p>
            </>
          )}
        </section>

        <section className="alias-results-board" aria-label={t(lang, "finalScores")}>
          <span className="alias-score-caption">{t(lang, "scoreboard")}</span>
          <Scoreboard teams={teams} activeTeamId={isGameOver ? winner?.id : undefined} />
          {!isGameOver ? (
            <span className="alias-score-target">
              {t(lang, "targetScore")} {targetScore} {t(lang, "pointsSuffix")}
            </span>
          ) : null}
        </section>
      </div>

      <div className="alias-results-actions">
        {isGameOver ? (
          <>
            <button type="button" className="alias-primary-button" onClick={onPlayAgain}>
              <RotateCcw aria-hidden="true" /> {t(lang, "playAgain")}
            </button>
            <button type="button" className="alias-secondary-button" onClick={onSetup}>
              <Settings aria-hidden="true" /> {t(lang, "backToSetup")}
            </button>
          </>
        ) : (
          <button type="button" className="alias-primary-button" onClick={onNext}>
            {t(lang, "nextTeam")} <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
