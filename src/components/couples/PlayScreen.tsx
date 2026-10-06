import { LogOut, Volume2, VolumeX } from "lucide-react";

import { cardCounter, TXT, turnLabel } from "@/lib/couples/i18n";
import type { CouplesQuestion, CouplesSettings, PlayPhase } from "@/lib/couples/types";

interface PlayScreenProps {
  settings: CouplesSettings;
  question: CouplesQuestion;
  options: [string, string];
  index: number;
  total: number;
  phase: PlayPhase;
  votes: { a: number | null; b: number | null };
  soundOn: boolean;
  onVote(choice: number): void;
  onPass(): void;
  onNext(): void;
  onExit(): void;
  onToggleSound(): void;
}

function PickRow({
  name,
  value,
  accent,
}: {
  name: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`cp-pick-row${accent ? " is-accent" : ""}`}>
      <span className="cp-pick-name">{name}</span>
      <span className="cp-pick-value">{value}</span>
    </div>
  );
}

export function PlayScreen({
  settings,
  question,
  options,
  index,
  total,
  phase,
  votes,
  soundOn,
  onVote,
  onPass,
  onNext,
  onExit,
  onToggleSound,
}: PlayScreenProps) {
  const progress = total > 0 ? ((index + (phase === "reveal" ? 1 : 0)) / total) * 100 : 0;
  const [nameA, nameB] = settings.names;
  const isMatch = votes.a !== null && votes.b !== null && votes.a === votes.b;
  const isLast = index + 1 >= total;

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
          aria-label={soundOn ? "Выключить звук" : "Включить звук"}
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
          <p>{TXT.passBody.replace("{name}", nameB)}</p>
          <button type="button" className="cp-primary" onClick={onPass}>
            {TXT.passButton.replace("{name}", nameB)}
          </button>
        </div>
      ) : (
        <div className="cp-card">
          <p className="cp-turn">
            {phase === "voteB" ? turnLabel(nameB) : phase === "voteA" ? turnLabel(nameA) : TXT.question}
          </p>
          <h2 className="cp-prompt">{question.prompt}</h2>

          {phase === "reveal" ? (
            <div className="cp-reveal" aria-live="polite">
              <span className={`cp-verdict${isMatch ? " is-match" : ""}`}>
                {isMatch ? TXT.revealMatch : TXT.revealNoMatch}
              </span>
              <div className="cp-picks">
                <PickRow name={nameA} value={options[votes.a ?? 0]} accent={isMatch} />
                <PickRow name={nameB} value={options[votes.b ?? 0]} accent={isMatch} />
              </div>
              <p className="cp-reveal-note">
                {isMatch ? TXT.revealMatchNote : TXT.revealNoMatchNote}
              </p>
            </div>
          ) : (
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
          )}
        </div>
      )}

      <footer className="cp-play-footer">
        {phase === "reveal" ? (
          <button type="button" className="cp-primary cp-wide" onClick={onNext}>
            {isLast ? TXT.finish : TXT.next}
          </button>
        ) : phase === "handoff" ? null : (
          <p className="cp-hint">{TXT.keyboardHint}</p>
        )}
      </footer>
    </div>
  );
}