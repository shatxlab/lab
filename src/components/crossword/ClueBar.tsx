import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import { stringsFor } from "@/lib/crossword/i18n";
import type { Lang, PlacedEntry } from "@/lib/crossword/types";

interface ClueBarProps {
  entry: PlacedEntry | undefined;
  lang: Lang;
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
export function ClueBar({ entry, lang, solved, hint, onPrev, onNext }: ClueBarProps) {
  const TXT = stringsFor(lang);
  return (
    <div className="cw-cluebar" data-solved={solved ? "true" : "false"}>
      <button type="button" className="cw-clue-nav" onClick={onPrev} aria-label={TXT.prevClue}>
        <ChevronLeft aria-hidden="true" />
      </button>
      <div className="cw-clue-body">
        {entry ? (
          <>
            <span className="cw-clue-badge" aria-label={`${TXT.clues} ${entry.number}`}>
              {solved ? <Check aria-hidden="true" /> : entry.number}
            </span>
            <p className="cw-clue-text">{entry.clue}</p>
          </>
        ) : (
          <p className="cw-clue-text cw-clue-text--empty">{hint ?? TXT.empty}</p>
        )}
      </div>
      <button type="button" className="cw-clue-nav" onClick={onNext} aria-label={TXT.nextClue}>
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
