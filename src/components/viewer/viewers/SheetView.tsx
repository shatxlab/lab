import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { SheetFindBar } from "@/components/viewer/viewers/SheetFindBar";
import {
  columnLabel,
  orderedSheetRows,
  type SheetData,
  type SheetSort,
} from "@/lib/viewer/sheet";
import { findSheetMatches, splitHighlighted, type SheetMatch } from "@/lib/viewer/sheet-find";
import { coerceSheetValue } from "@/lib/viewer/sheet-edit";
import { columnsPlural, notesPlural, rowsPlural, t } from "@/lib/viewer/i18n";
import { cn } from "@/lib/viewer/utils";
import type { AppLang } from "@/lib/apps/lang";

/**
 * Even the capped 5,000 rows can be 100k cells, which is too many DOM nodes to
 * mount at once, so rows are appended a chunk at a time as the reader scrolls.
 */
const ROW_CHUNK = 200;

export type SheetViewHandle = {
  focusFind: () => void;
};

/** The cell currently being edited inline, in display coordinates. */
type EditTarget = { sourceRow: number; column: number };

export type SheetViewProps = {
  lang: AppLang;
  sheets: SheetData[];
  /** Present only when the file has a backing workbook and can be edited. */
  onEditCell?: (sheetName: string, addr: string, value: string | number | null) => void;
  onAddRow?: (sheetName: string) => void;
  /**
   * Identity of the underlying document. The find query, sort and scroll
   * reset when a DIFFERENT file opens — not when the sheets array is
   * re-derived because a cell was edited, which would wreck the reader's
   * place after every keystroke commit.
   */
  resetKey?: string;
};

export const SheetView = React.forwardRef<SheetViewHandle, SheetViewProps>(
  function SheetView({ lang, sheets, onEditCell, onAddRow, resetKey }, ref) {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [visibleRows, setVisibleRows] = React.useState(ROW_CHUNK);
    const [sort, setSort] = React.useState<SheetSort | null>(null);
    const [query, setQuery] = React.useState("");
    const [matchIndex, setMatchIndex] = React.useState(0);
    const [editing, setEditing] = React.useState<EditTarget | null>(null);

    const scrollRef = React.useRef<HTMLDivElement>(null);
    const sentinelRef = React.useRef<HTMLDivElement>(null);
    const findInputRef = React.useRef<HTMLInputElement>(null);
    /** The td being edited, so commit and cancel can hand focus back to it. */
    const cellRef = React.useRef<HTMLElement | null>(null);
    const scrollSnapshot = React.useRef<ScrollPosition | null>(null);
    const pendingMatch = React.useRef<SheetMatch | null>(null);

    const active = sheets[Math.min(activeIndex, sheets.length - 1)];

    React.useImperativeHandle(ref, () => ({
      focusFind() {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      },
    }));

    React.useEffect(() => {
      scrollSnapshot.current = null;
      setActiveIndex(0);
      setSort(null);
      setVisibleRows(ROW_CHUNK);
      setQuery("");
      setMatchIndex(0);
      setEditing(null);
      resetScroll(scrollRef.current);
    }, [resetKey]);

    React.useEffect(() => {
      scrollSnapshot.current = null;
      setVisibleRows(ROW_CHUNK);
      setMatchIndex(0);
      resetScroll(scrollRef.current);
    }, [activeIndex]);

    React.useLayoutEffect(() => {
      const scroller = scrollRef.current;
      const snapshot = scrollSnapshot.current;
      if (!scroller || !snapshot) return;
      restoreScroll(scroller, snapshot);
      const frame = requestAnimationFrame(() => {
        restoreScroll(scroller, snapshot);
        scrollSnapshot.current = null;
      });
      return () => cancelAnimationFrame(frame);
    }, [sort]);

    const orderedRows = React.useMemo(
      () => (active ? orderedSheetRows(active.rows, sort) : []),
      [active, sort],
    );
    const headerRow = orderedRows[0];
    const bodyRows = orderedRows.slice(1);
    const rowCount = bodyRows.length;
    const hasMoreRows = visibleRows < rowCount;

    const matches = React.useMemo(() => findSheetMatches(orderedRows, query), [orderedRows, query]);
    const currentMatch = matches[matchIndex] ?? null;

    React.useEffect(() => {
      setMatchIndex((index) => (matches.length === 0 ? 0 : Math.min(index, matches.length - 1)));
    }, [matches.length]);

    React.useEffect(() => {
      const sentinel = sentinelRef.current;
      const root = scrollRef.current;
      if (!sentinel || !root || !hasMoreRows || typeof IntersectionObserver === "undefined") return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisibleRows((count) => Math.min(count + ROW_CHUNK, rowCount));
          }
        },
        { root, rootMargin: "600px" },
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
    }, [hasMoreRows, rowCount]);

    const revealMatch = React.useCallback((match: SheetMatch) => {
      pendingMatch.current = match;
      setVisibleRows((count) => Math.max(count, match.displayIndex + ROW_CHUNK));
    }, []);

    React.useLayoutEffect(() => {
      const match = pendingMatch.current;
      if (!match) return;

      const cell = scrollRef.current?.querySelector(
        `[data-sheet-cell="${match.sourceRow}-${match.column}"]`,
      );
      if (!(cell instanceof HTMLElement)) return;

      pendingMatch.current = null;
      cell.scrollIntoView?.({ block: "center", inline: "nearest" });
    }, [currentMatch, visibleRows]);

    const cycleSort = React.useCallback((column: number) => {
      const scroller = scrollRef.current;
      if (scroller) {
        scrollSnapshot.current = { left: scroller.scrollLeft, top: scroller.scrollTop };
      }
      setSort((current) => {
        if (current?.column !== column) return { column, direction: "asc" };
        if (current.direction === "asc") return { column, direction: "desc" };
        return null;
      });
    }, []);

    const goToMatch = React.useCallback(
      (nextIndex: number) => {
        if (matches.length === 0) return;
        const wrapped = (nextIndex + matches.length) % matches.length;
        setMatchIndex(wrapped);
        const match = matches[wrapped];
        if (match) revealMatch(match);
      },
      [matches, revealMatch],
    );

    const handleQueryChange = React.useCallback(
      (value: string) => {
        setQuery(value);
        setMatchIndex(0);
        const nextMatches = findSheetMatches(orderedRows, value);
        const first = nextMatches[0];
        if (first) revealMatch(first);
      },
      [orderedRows, revealMatch],
    );

    const handleFindEscape = React.useCallback(() => {
      setQuery("");
      setMatchIndex(0);
    }, []);

    const startEdit = React.useCallback(
      (sourceRow: number, column: number, element: HTMLElement | null) => {
        if (!onEditCell || !active) return;
        // React reuses the td node across the editor unmount, so the reference
        // stays valid when the edit ends and focus can move back to it.
        cellRef.current = element;
        setEditing({ sourceRow, column });
      },
      [onEditCell, active],
    );

    const cancelEdit = React.useCallback(() => {
      setEditing(null);
      cellRef.current?.focus();
    }, []);

    /*
     * The commit is addressed by CELL, not by display position: the row the
     * user double-clicked keeps its `sourceRow` even after a sort, and the
     * column index maps back to its letter inside the sheet's real range.
     */
    const commitEdit = React.useCallback(
      (target: EditTarget, text: string) => {
        setEditing(null);
        cellRef.current?.focus();
        if (!onEditCell || !active) return;
        /*
         * The editor is prefilled with the DISPLAY string — a formatted date
         * or number, not the raw value underneath. Committing that string back
         * unchanged would re-type the cell as text and corrupt it, so an
         * unchanged draft records no edit at all.
         */
        const displayed = active.rows[target.sourceRow]?.[target.column] ?? "";
        if (text === displayed) return;
        const startColumn = active.range?.startColumn ?? 0;
        const startRow = active.range?.startRow ?? 0;
        const addr = `${columnLabel(startColumn + target.column)}${startRow + target.sourceRow + 1}`;
        onEditCell(active.name, addr, coerceSheetValue(text));
      },
      [onEditCell, active],
    );

    const handleAddRow = React.useCallback(() => {
      if (!onAddRow || !active) return;
      onAddRow(active.name);
    }, [onAddRow, active]);

    const canEdit = Boolean(onEditCell);

    if (!active) {
      return <EmptyState>This file has no sheets.</EmptyState>;
    }

    const columns = Array.from({ length: active.columnCount }, (_, index) => index);
    const needle = query.trim();

    return (
      <div className="flex h-full min-h-0 flex-col">
        {sheets.length > 1 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-(--border) px-2 py-2">
            {sheets.map((sheet, index) => (
              <button
                key={`${sheet.name}-${index}`}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  setSort(null);
                }}
                className={cn(
                  "shrink-0 cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors",
                  index === activeIndex
                    ? "bg-(--accent)/15 font-medium text-(--accent)"
                    : "text-(--muted-fg) hover:bg-(--surface) hover:text-(--fg)",
                )}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        )}

        <SheetFindBar
          lang={lang}
          query={query}
          matchIndex={matchIndex}
          matchCount={matches.length}
          onQueryChange={handleQueryChange}
          onPrev={() => goToMatch(matchIndex - 1)}
          onNext={() => goToMatch(matchIndex + 1)}
          onEscape={handleFindEscape}
          inputRef={findInputRef}
        />

        {active.rows.length === 0 ? (
          <EmptyState>{t(lang, "emptySheet")}</EmptyState>
        ) : (
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-auto [overflow-anchor:none]"
            data-sheet-scroller=""
          >
            {/*
              `border-separate` rather than `border-collapse`: collapsed borders are
              owned by the table, so they vanish from cells that become sticky.
            */}
            <table className="border-separate border-spacing-0 text-[0.9375rem] leading-relaxed">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 border-r border-b border-(--border) bg-(--surface)" />
                  {columns.map((column) => (
                    <th
                      key={column}
                      aria-sort={ariaSort(sort, column)}
                      className="border-r border-b border-(--border) bg-(--surface) p-0 text-xs font-medium text-(--muted-fg)"
                    >
                      <button
                        type="button"
                        onMouseDown={suppressStickyHeaderFocusScroll}
                        onClick={() => cycleSort(column)}
                        title={`Sort by column ${columnLabel(column)}`}
                        aria-label={sortButtonLabel(column, sort)}
                        className={cn(
                          "inline-flex w-full cursor-pointer items-center justify-center gap-1 px-3 py-1.5 hover:bg-(--surface) hover:text-(--fg)",
                          sort?.column === column && "text-(--accent)",
                        )}
                      >
                        <span>{columnLabel(column)}</span>
                        {sort?.column === column &&
                          (sort.direction === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          ))}
                      </button>
                    </th>
                  ))}
                </tr>
                {headerRow && (
                  <tr>
                    <th className="sticky left-0 z-30 border-r border-b border-(--border) bg-(--surface) px-3 py-1.5 text-right text-xs font-normal text-(--muted-fg) tabular-nums">
                      {headerRow.sourceRow + 1}
                    </th>
                    {headerRow.cells.map((cell, columnIndex) => (
                      <td
                        key={columnIndex}
                        data-sheet-cell={`${headerRow.sourceRow}-${columnIndex}`}
                        onDoubleClick={(event) => startEdit(headerRow.sourceRow, columnIndex, event.currentTarget)}
                        tabIndex={canEdit ? -1 : undefined}
                        title={canEdit ? t(lang, "doubleClickToEdit") : undefined}
                        className={cn(
                          "border-r border-b border-(--border) bg-(--bg) px-3 py-1.5 align-top font-medium tabular-nums",
                          canEdit && "cursor-text",
                        )}
                      >
                        {editing?.sourceRow === headerRow.sourceRow && editing.column === columnIndex ? (
                          <CellEditor
                            lang={lang}
                            initialValue={cell}
                            onCommit={(text) => commitEdit(editing, text)}
                            onCancel={cancelEdit}
                          />
                        ) : (
                          <SheetCell
                            text={cell}
                            query={needle}
                            current={isCurrentMatch(currentMatch, headerRow.sourceRow, columnIndex)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {bodyRows.slice(0, visibleRows).map((row) => (
                  <tr key={row.sourceRow} className="group">
                    <th className="sticky left-0 z-10 border-r border-b border-(--border) bg-(--surface) px-3 py-1.5 align-top text-right text-xs font-normal text-(--muted-fg) tabular-nums">
                      {row.sourceRow + 1}
                    </th>
                    {row.cells.map((cell, columnIndex) => (
                      <td
                        key={columnIndex}
                        data-sheet-cell={`${row.sourceRow}-${columnIndex}`}
                        onDoubleClick={(event) => startEdit(row.sourceRow, columnIndex, event.currentTarget)}
                        tabIndex={canEdit ? -1 : undefined}
                        title={canEdit ? t(lang, "doubleClickToEdit") : undefined}
                        className={cn(
                          "border-r border-b border-(--border) px-3 py-1.5 align-top tabular-nums group-hover:bg-(--surface)",
                          canEdit && "cursor-text",
                        )}
                      >
                        {editing?.sourceRow === row.sourceRow && editing.column === columnIndex ? (
                          <CellEditor
                            lang={lang}
                            initialValue={cell}
                            onCommit={(text) => commitEdit(editing, text)}
                            onCancel={cancelEdit}
                          />
                        ) : (
                          <SheetCell
                            text={cell}
                            query={needle}
                            current={isCurrentMatch(currentMatch, row.sourceRow, columnIndex)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div ref={sentinelRef} aria-hidden="true" className="h-1" />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-3 border-t border-(--border) px-4 py-2 text-xs text-(--muted-fg)">
          {onAddRow && (
            <button
              type="button"
              onClick={handleAddRow}
              title={t(lang, "appendRow")}
              className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-(--accent) transition-colors hover:bg-(--surface)"
            >
              {t(lang, "addRow")}
            </button>
          )}
          <p className="min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
            {active.name} &middot;{" "}
            {t(lang, "rowsColumns", {
              rows: active.totalRows.toLocaleString("en-US"),
              columns: active.columnCount.toLocaleString("en-US"),
              rowsPlural: rowsPlural(active.totalRows),
              columnsPlural: columnsPlural(active.columnCount),
            })}
            {sort && (
              <>
                {" "}
                &middot;{" "}
                {t(lang, "sortedBy", {
                  column: columnLabel(sort.column),
                  direction: sort.direction === "asc" ? t(lang, "ascending") : t(lang, "descending"),
                })}
              </>
            )}
            {active.truncated && (
              <span className="text-(--accent)">
                {" "}
                &middot; {t(lang, "showingFirstRows", { count: active.rows.length.toLocaleString("en-US") })}
              </span>
            )}
          </p>
        </div>
      </div>
    );
  },
);

function isCurrentMatch(match: SheetMatch | null, sourceRow: number, column: number): boolean {
  return match?.sourceRow === sourceRow && match.column === column;
}

/**
 * The inline editor a double-clicked cell turns into. Enter and blur commit
 * (an empty draft clears the cell), Escape cancels without touching anything.
 * `settled` makes commit-on-blur and commit-on-Enter mutually exclusive: after
 * Enter accepts the draft the unmount must not also fire a blur commit, and
 * after Escape the blur that follows the unmount must not commit either.
 */
function CellEditor({
  lang,
  initialValue,
  onCommit,
  onCancel,
}: {
  lang: AppLang;
  initialValue: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(initialValue);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const settled = React.useRef(false);

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(draft);
  };

  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // Typing here is not a shortcut for the app: keep Escape from closing
        // the whole viewer and every other key from reaching window handlers.
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      aria-label={t(lang, "editCell")}
      className="w-full max-w-[28rem] rounded-sm border border-(--accent) bg-(--bg) px-1.5 py-0.5 text-[0.9375rem] leading-relaxed text-(--fg) outline-none"
    />
  );
}

function SheetCell({ text, query, current }: { text: string; query: string; current: boolean }) {
  const parts = splitHighlighted(text, query);

  return (
    <div
      className={cn(
        "w-max max-w-[28rem] whitespace-pre-wrap break-words leading-relaxed",
        current && "rounded-sm bg-(--accent)/20 ring-1 ring-(--accent)",
      )}
    >
      {parts.map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-(--accent)/30 text-inherit">
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        ),
      )}
    </div>
  );
}

function ariaSort(sort: SheetSort | null, column: number): React.AriaAttributes["aria-sort"] {
  if (sort?.column !== column) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

function sortButtonLabel(column: number, sort: SheetSort | null): string {
  const label = columnLabel(column);
  if (sort?.column !== column) return `Sort column ${label}`;
  if (sort.direction === "asc") return `Sort column ${label}, currently ascending`;
  return `Sort column ${label}, currently descending`;
}

type ScrollPosition = { left: number; top: number };

function resetScroll(scroller: HTMLDivElement | null) {
  if (!scroller) return;
  restoreScroll(scroller, { left: 0, top: 0 });
}

function restoreScroll(scroller: HTMLDivElement, snapshot: ScrollPosition) {
  scroller.scrollLeft = snapshot.left;
  scroller.scrollTop = snapshot.top;
}

/**
 * Focusing a control inside a sticky table header makes the browser scroll the
 * overflow pane to that header's layout origin — the top-left of the sheet,
 * column A. Swallow the default focus-on-mousedown so a click does not move
 * the viewport; keyboard focus (Tab, then Enter) is unchanged.
 */
function suppressStickyHeaderFocusScroll(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-(--muted-fg)">
      {children}
    </div>
  );
}
