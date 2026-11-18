import type { CSSProperties, InputEventHandler, KeyboardEvent, RefObject } from "react";

import { stringsFor, t } from "@/lib/crossword/i18n";
import { cellKey } from "@/lib/crossword/grid";
import type { Cursor } from "@/lib/crossword/game";
import type { BuiltPuzzle } from "@/lib/crossword/types";

/**
 * Zero-width space kept in the hidden input. An input with a real character
 * always emits a Backspace event, so an empty cell can still step backwards
 * on mobile keyboards that otherwise stay silent.
 */
const SENTINEL = "\u200b";

export interface GridProps {
  style?: CSSProperties;
  built: BuiltPuzzle;  values: Record<string, string>;
  cursor: Cursor;
  /** Cells that belong to the word being edited. */
  activeCells: Set<string>;
  /** Cells that belong to at least one completed word. */
  solvedCells: Set<string>;
  /** Filled cells that disagree with the solution (after "check"). */
  wrong: Set<string>;
  /** Cells revealed with the hint button. */
  revealed: Set<string>;
  focused: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect(row: number, col: number): void;
  onChange(text: string): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
  onBeforeInput: InputEventHandler<HTMLInputElement>;
  onFocusChange(focused: boolean): void;
}

/**
 * The grid is a CSS grid of buttons plus a single always-present, invisible
 * `<input>` parked on the active cell via `grid-area`. Because the input node
 * never unmounts, focus (and therefore the system keyboard) survives moving
 * from cell to cell — that is what makes the stock mobile keyboard usable.
 */
export function Grid({
  built,
  style,
  values,
  cursor,
  activeCells,
  solvedCells,
  wrong,
  revealed,
  focused,
  inputRef,
  onSelect,
  onChange,
  onKeyDown,
  onBeforeInput,
  onFocusChange,
}: GridProps) {
  const TXT = stringsFor(built.puzzle.lang);
  return (
    <div
      className="cw-grid"
      role="group"
      aria-label={`${TXT.appName} ${built.puzzle.title}`}
      data-focused={focused ? "true" : "false"}
      style={{ "--cw-cols": built.cols, "--cw-rows": built.rows, ...style } as CSSProperties}
    >
      {built.cells.map((cell) => {
        if (cell.isBlack) {
          return <div key={`b-${cell.row}-${cell.col}`} className="cw-cell cw-cell--black" aria-hidden="true" />;
        }
        const key = cellKey(cell.row, cell.col);
        const letter = values[key] ?? "";
        const classes = ["cw-cell"];
        if (activeCells.has(key)) classes.push("is-word");
        if (solvedCells.has(key)) classes.push("is-solved");
        if (wrong.has(key)) classes.push("is-wrong");
        if (cell.row === cursor.row && cell.col === cursor.col) classes.push("is-active");
        const label = [
          cell.number ? `${cell.number}.` : "",
          letter || TXT.emptyCell,
          t(built.puzzle.lang, "cellPosition", { row: cell.row + 1, col: cell.col + 1 }),
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={key}
            type="button"
            className={classes.join(" ")}
            data-cell={key}
            aria-label={label}
            onMouseDown={event => event.preventDefault()}
            onClick={() => onSelect(cell.row, cell.col)}
          >
            {cell.number ? <span className="cw-cell-number">{cell.number}</span> : null}
            {revealed.has(key) ? <span className="cw-cell-dot" aria-hidden="true" /> : null}
            <span className="cw-cell-letter">{letter}</span>
          </button>
        );
      })}
      <input
        ref={inputRef}
        className="cw-input"
        style={{ gridArea: `${cursor.row + 1} / ${cursor.col + 1}` }}
        type="text"
        inputMode="text"
        lang={built.puzzle.lang}
        defaultValue={SENTINEL}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="done"
        aria-label={TXT.inputLabel}
        onChange={(event) => {
          const target = event.currentTarget;
          const text = target.value;
          // Reset to the sentinel so Backspace always has something to delete,
          // which is what lets it fire on an otherwise empty mobile input.
          target.value = SENTINEL;
          onChange(text.replace(SENTINEL, ""));
        }}
        onKeyDown={onKeyDown}
        onBeforeInput={onBeforeInput}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
      />
    </div>
  );
}
