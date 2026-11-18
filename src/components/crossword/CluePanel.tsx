import { Check, X } from "lucide-react";

import { stringsFor } from "@/lib/crossword/i18n";
import type { BuiltPuzzle, PlacedEntry } from "@/lib/crossword/types";

interface CluePanelProps {
  built: BuiltPuzzle;
  activeEntryId: string | null;
  solved: Set<string>;
  onSelect(id: string): void;
}

function ClueItem({
  entry,
  active,
  solved,
  onSelect,
}: {
  entry: PlacedEntry;
  active: boolean;
  solved: boolean;
  onSelect(id: string): void;
}) {
  return (
    <li>
      <button
        type="button"
        className="cw-clue-item"
        data-active={active ? "true" : "false"}
        data-solved={solved ? "true" : "false"}
        onClick={() => onSelect(entry.id)}
      >
        <span className="cw-clue-item-number">{entry.number}</span>
        <span className="cw-clue-item-text">{entry.clue}</span>
        <span className="cw-clue-item-mark" aria-hidden="true">
          {solved ? <Check /> : null}
        </span>
      </button>
    </li>
  );
}

/** Full clue list, used as a desktop sidebar and a mobile bottom sheet. */
export function CluePanel({ built, activeEntryId, solved, onSelect }: CluePanelProps) {
  const TXT = stringsFor(built.puzzle.lang);
  return (
    <div className="cw-clues">
      <section className="cw-clues-section">
        <h2>{TXT.across}</h2>
        <ul>
          {built.across.map((entry) => (
            <ClueItem
              key={entry.id}
              entry={entry}
              active={entry.id === activeEntryId}
              solved={solved.has(entry.id)}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </section>
      <section className="cw-clues-section">
        <h2>{TXT.down}</h2>
        <ul>
          {built.down.map((entry) => (
            <ClueItem
              key={entry.id}
              entry={entry}
              active={entry.id === activeEntryId}
              solved={solved.has(entry.id)}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Mobile bottom sheet wrapper around the clue list. */
export function ClueSheet({
  open,
  onClose,
  ...panel
}: CluePanelProps & { open: boolean; onClose(): void }) {
  if (!open) return null;
  const TXT = stringsFor(panel.built.puzzle.lang);
  return (
    <div className="cw-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cw-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={TXT.clues}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cw-sheet-head">
          <span className="cw-sheet-grip" aria-hidden="true" />
          <h2>{TXT.clues}</h2>
          <button type="button" className="cw-icon-button" onClick={onClose} aria-label={TXT.close}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="cw-sheet-body">
          <CluePanel {...panel} />
        </div>
      </div>
    </div>
  );
}
