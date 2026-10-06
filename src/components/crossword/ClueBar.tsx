import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import type { PlacedEntry } from "@/lib/crossword/types";

interface ClueBarProps {
  entry: PlacedEntry | undefined;
  solved: boolean;
  hint?: string;
  onPrev(): void;
  onNext(): void;
}

/**
 * The active clue, pinned above the grid so it stays visible with the
 * on-screen keyboard open. It deliberately says nothing about direction: the
 * highlighted squares already show where the word runs.
 */
export function ClueBar({ entry, solved, hint, onPrev, onNext }: ClueBarProps) {
  return (
    <div className="cw-cluebar" data-solved={solved ? "true" : "false"}>
      <button type="button" className="cw-clue-nav" onClick={onPrev} aria-label="Предыдущее слово">
        <ChevronLeft aria-hidden="true" />
      </button>
      <div className="cw-clue-body">
        {entry ? (
          <>
            <span className="cw-clue-badge" aria-label={`Слово ${entry.number}`}>
              {solved ? <Check aria-hidden="true" /> : entry.number}
            </span>
            <p className="cw-clue-text">{entry.clue}</p>
          </>
        ) : (
          <p className="cw-clue-text cw-clue-text--empty">{hint ?? "Выберите слово"}</p>
        )}
      </div>
      <button type="button" className="cw-clue-nav" onClick={onNext} aria-label="Следующее слово">
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
