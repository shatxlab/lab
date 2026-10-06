import { Check, Play } from "lucide-react";
import type { CSSProperties } from "react";

import { solvedEntryIds } from "@/lib/crossword/game";
import { difficultyLabel, progressText, TXT } from "@/lib/crossword/i18n";
import type { StoredPuzzleProgress } from "@/lib/crossword/storage";
import type { BuiltPuzzle, CrosswordPuzzle } from "@/lib/crossword/types";

export interface PickerItem {
  puzzle: CrosswordPuzzle;
  built: BuiltPuzzle;
  progress: StoredPuzzleProgress | undefined;
}

interface PuzzlePickerProps {
  items: PickerItem[];
  onOpen(id: string): void;
}

/** Tiny non-interactive preview of a board's shape. */
function MiniGrid({ built }: { built: BuiltPuzzle }) {
  return (
    <div
      className="cw-mini"
      aria-hidden="true"
      style={{ "--cw-cols": built.cols, "--cw-rows": built.rows } as CSSProperties}
    >
      {built.cells.map((cell) => (
        <span key={`${cell.row}-${cell.col}`} className={cell.isBlack ? "is-black" : "is-white"} />
      ))}
    </div>
  );
}

function statusOf(item: PickerItem) {
  const total = item.built.entries.length;
  const solved = item.progress ? solvedEntryIds(item.built, item.progress.values).size : 0;
  const completed = item.progress?.completed === true || solved === total;
  const label = completed ? TXT.solvedBadge : solved > 0 ? TXT.progressBadge : TXT.newBadge;
  return { solved, total, completed, label };
}

export function PuzzlePicker({ items, onOpen }: PuzzlePickerProps) {
  return (
    <div className="cw-picker">
      <header className="cw-picker-hero">
        <p className="cw-eyebrow">{TXT.tagline}</p>
        <h1>{TXT.pickTitle}</h1>
        <p className="cw-picker-note">{TXT.pickSubtitle}</p>
      </header>
      <div className="cw-card-grid">
        {items.map((item) => {
          const status = statusOf(item);
          const percent = Math.round((status.solved / status.total) * 100);
          return (
            <button
              key={item.puzzle.id}
              type="button"
              className="cw-card"
              data-completed={status.completed ? "true" : "false"}
              onClick={() => onOpen(item.puzzle.id)}
            >
              <span className="cw-card-top">
                <MiniGrid built={item.built} />
                <span className="cw-card-info">
                  <span className="cw-card-badges">
                    <span className="cw-badge" data-tone={status.completed ? "success" : "muted"}>
                      {status.label}
                    </span>
                    <span className="cw-badge" data-tone="ghost">
                      {difficultyLabel(item.puzzle.difficulty)}
                    </span>
                  </span>
                  <span className="cw-card-title">{item.puzzle.title}</span>
                  <span className="cw-card-subtitle">{item.puzzle.subtitle}</span>
                  <span className="cw-card-meta">
                    {item.built.rows}×{item.built.cols} · {item.built.entries.length} {TXT.wordsSuffix}
                  </span>
                </span>
              </span>
              <span className="cw-card-progress">
                <span className="cw-card-bar" aria-hidden="true">
                  <span className="cw-card-bar-fill" style={{ width: `${percent}%` }} />
                </span>
                <span className="cw-card-progress-label">
                  {status.completed ? <Check aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {progressText(status.solved, status.total)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
