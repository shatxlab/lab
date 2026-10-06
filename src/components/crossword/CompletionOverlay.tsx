import { Clock, Lightbulb, RotateCcw, Trophy, X } from "lucide-react";
import { useMemo } from "react";
import type { CSSProperties } from "react";

import { formatDuration } from "@/lib/crossword/game";
import { stringsFor } from "@/lib/crossword/i18n";
import type { BuiltPuzzle, Lang } from "@/lib/crossword/types";

interface CompletionOverlayProps {
  built: BuiltPuzzle;
  lang: Lang;
  elapsed: number;
  hints: number;
  hasNext: boolean;
  onReplay(): void;
  onNext(): void;
  onList(): void;
}

const CONFETTI_COLORS = ["#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185"];

function makeConfetti(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    duration: 2.4 + Math.random() * 1.6,
    drift: (Math.random() - 0.5) * 120,
    spin: 180 + Math.random() * 540,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 7,
  }));
}

export function CompletionOverlay({
  built,
  lang,
  elapsed,
  hints,
  hasNext,
  onReplay,
  onNext,
  onList,
}: CompletionOverlayProps) {
  const TXT = stringsFor(lang);
  const confetti = useMemo(() => makeConfetti(44), []);
  return (
    <div className="cw-complete" role="dialog" aria-modal="true" aria-label={TXT.completeTitle}>
      <div className="cw-confetti" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className="cw-confetti-piece"
            style={
              {
                left: `${piece.left}%`,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
                "--cw-drift": `${piece.drift}px`,
                "--cw-spin": `${piece.spin}deg`,
                "--cw-confetti": piece.color,
                width: `${piece.size}px`,
                height: `${piece.size * 1.6}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="cw-complete-card">
        <span className="cw-complete-icon">
          <Trophy aria-hidden="true" />
        </span>
        <p className="cw-complete-eyebrow">{built.puzzle.title}</p>
        <h2>{TXT.completeTitle}</h2>
        <p className="cw-complete-sub">{hints > 0 ? TXT.completeWithHints : TXT.completeNoHints}</p>
        <div className="cw-complete-stats">
          <span className="cw-stat">
            <Clock aria-hidden="true" />
            <span className="cw-stat-label">{TXT.timeLabel}</span>
            <strong>{formatDuration(elapsed)}</strong>
          </span>
          <span className="cw-stat">
            <Lightbulb aria-hidden="true" />
            <span className="cw-stat-label">{TXT.hintsLabel}</span>
            <strong>{hints}</strong>
          </span>
        </div>
        <div className="cw-complete-actions">
          <button type="button" className="cw-secondary-button" onClick={onReplay}>
            <RotateCcw aria-hidden="true" />
            {TXT.playAgain}
          </button>
          {hasNext ? (
            <button type="button" className="cw-primary-button" onClick={onNext}>
              {TXT.nextPuzzle}
            </button>
          ) : null}
        </div>
        <button type="button" className="cw-complete-list" onClick={onList}>
          <X aria-hidden="true" />
          {TXT.toList}
        </button>
      </div>
    </div>
  );
}
