import { LogOut, Volume2, VolumeX } from "lucide-react";

import { cardCounter, passBody, passButton, stringsFor, turnLabel } from "@/lib/couples/i18n";
import type { CouplesQuestion, CouplesSettings, PlayPhase } from "@/lib/couples/types";

interface PlayScreenProps {
  settings: CouplesSettings;
  question: CouplesQuestion;
  options: [string, string];
  index: number;
  total: number;
  phase: PlayPhase;
  soundOn: boolean;
  onVote(choice: number): void;
  onPass(): void;
  onExit(): void;
  onToggleSound(): void;
  /** Turn this card off for good. */
  onHide(): void;
  /** True once this card is already turned off. */
  hidden: boolean;
}

export function PlayScreen({
  settings,
  question,
  options,
  index,
  total,
  phase,
  soundOn,
  onVote,
  onPass,
  onExit,
  onToggleSound,
  onHide,
  hidden,
}: PlayScreenProps) {
  const TXT = stringsFor(settings.lang);
  const progress = total > 0 ? (index / total) * 100 : 0;
  const [nameA, nameB] = settings.names;

  return (
    <div className="cp-play">
      <header className="cp-play-bar">
        <button type="button" className="cp-icon" onClick={onExit} aria-label={TXT.exit}>
          <LogOut aria-hidden="true" />
        </button>
        <span className="cp-counter">{cardCounter(index + 1, total)}</span>
        <button
          type="button"
          className="cp-icon"
          onClick={onToggleSound}
          aria-label={soundOn ? TXT.mute : TXT.unmute}
        >
          {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        </button>
      </header>
      <div className="cp-progress" aria-hidden="true">
        <span className="cp-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {phase === "handoff" ? (
        <div className="cp-pass">
          <span className="cp-pass-emoji" aria-hidden="true">
            🙈
          </span>
          <h2>{TXT.passTitle}</h2>
          <p>{passBody(settings.lang, nameB)}</p>
          <button type="button" className="cp-primary" onClick={onPass}>
            {passButton(settings.lang, nameB)}
          </button>
        </div>
      ) : (
        <div className="cp-card">
          <p className="cp-turn">
            {phase === "voteB" ? turnLabel(settings.lang, nameB) : phase === "voteA" ? turnLabel(settings.lang, nameA) : TXT.question}
          </p>
          <h2 className="cp-prompt">{question.prompt}</h2>
          {phase === "voteTogether" && question.followUp ? (
            <p className="cp-followup">
              <span className="cp-followup-label">{TXT.followUpLabel}</span>
              {question.followUp}
            </p>
          ) : null}

          <div className="cp-options">
            {options.map((option, optionIndex) => (
              <button
                key={option}
                type="button"
                className="cp-option"
                onClick={(event) => {
                  // Drop focus so the previous answer never keeps an outline
                  // when the next card renders in the same spot.
                  event.currentTarget.blur();
                  onVote(optionIndex);
                }}
              >
                <span className="cp-option-key" aria-hidden="true">
                  {optionIndex + 1}
                </span>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="cp-play-footer">
        {phase === "handoff" ? null : <p className="cp-hint">{TXT.keyboardHint}</p>}
        {phase !== "handoff" && (
          <button type="button" className="cp-hide" onClick={onHide} disabled={hidden} aria-pressed={hidden}>
            {hidden ? TXT.hiddenCard : TXT.hideCard}
          </button>
        )}
      </footer>
    </div>
  );
}
