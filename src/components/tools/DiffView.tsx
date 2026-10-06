import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { CopyButton } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import {
  collapseRows,
  computeDiff,
  DiffTooLargeError,
  unifiedPatch,
  type DiffCell,
  type DiffResult,
  type DiffRow,
} from "@/lib/text/diff";
import { td } from "@/lib/text/diff-i18n";
import { cn } from "@/lib/viewer/utils";

type Mode = "split" | "unified";

/** Rendered row budget — the DOM, not the diff, is what gets slow. */
const MAX_RENDERED_ROWS = 4000;

type DiffViewProps = {
  lang: AppLang;
  leftName: string;
  rightName: string;
  leftText: string;
  rightText: string;
  /** Fill the parent's height and scroll internally (the viewer does). */
  fill?: boolean;
};

function Cell({ cell, kind, lang, side }: { cell: DiffCell | null; kind: DiffRow["kind"]; lang: AppLang; side: "left" | "right" }) {
  if (!cell) return <td className={`diff-text diff-${side} diff-empty`} aria-hidden="true" />;
  const label = kind === "add" ? td(lang, "added") : kind === "remove" ? td(lang, "removed") : kind === "change" ? td(lang, "changed") : "";
  return (
    <td className={`diff-text diff-${side}`}>
      {label && <span className="sr-only">{label}</span>}
      {cell.segments.length === 0 || cell.segments.every((s) => s.text === "")
        ? "\u00a0"
        : cell.segments.map((segment, index) =>
            segment.changed && kind === "change" ? (
              <mark key={index} className="diff-changed">
                {segment.text}
              </mark>
            ) : (
              <React.Fragment key={index}>{segment.text}</React.Fragment>
            ),
          )}
    </td>
  );
}

/**
 * Side-by-side / unified diff of two texts with word-level highlights,
 * collapsible unchanged regions and previous/next change navigation.
 * Shared by the document viewer and the text tools.
 */
export function DiffView({ lang, leftName, rightName, leftText, rightText, fill = false }: DiffViewProps) {
  const [mode, setMode] = React.useState<Mode>("split");
  const [ignoreWhitespace, setIgnoreWhitespace] = React.useState(false);
  const [ignoreCase, setIgnoreCase] = React.useState(false);
  const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(new Set());
  const [current, setCurrent] = React.useState(-1);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const computed = React.useMemo<{ result: DiffResult } | { error: true }>(() => {
    try {
      return { result: computeDiff(leftText, rightText, { ignoreWhitespace, ignoreCase }) };
    } catch (error) {
      if (error instanceof DiffTooLargeError) return { error: true };
      throw error;
    }
  }, [leftText, rightText, ignoreWhitespace, ignoreCase]);

  React.useEffect(() => {
    setExpanded(new Set());
    setCurrent(-1);
  }, [computed]);

  const result = "result" in computed ? computed.result : null;
  const chunks = React.useMemo(() => (result ? collapseRows(result.rows, 3, expanded) : []), [result, expanded]);

  const goTo = (direction: 1 | -1) => {
    if (!result || result.blocks.length === 0) return;
    const total = result.blocks.length;
    const next = current < 0 ? (direction === 1 ? 0 : total - 1) : (current + direction + total) % total;
    setCurrent(next);
    const rowIndex = result.blocks[next]!;
    window.requestAnimationFrame(() => {
      bodyRef.current?.querySelector(`[data-row="${rowIndex}"]`)?.scrollIntoView?.({ block: "center" });
    });
  };

  const patch = React.useMemo(
    () => (result && !result.identical ? unifiedPatch(leftText, rightText, leftName, rightName, { ignoreWhitespace }) : ""),
    [result, leftText, rightText, leftName, rightName, ignoreWhitespace],
  );

  const currentRow = result && current >= 0 ? result.blocks[current] : -1;
  let renderedRows = 0;
  let truncated = false;

  const renderRow = (row: DiffRow, index: number) => {
    renderedRows += 1;
    const isCurrent = index === currentRow;
    if (mode === "split") {
      return (
        <tr key={index} data-row={index} className={cn("diff-row", `diff-${row.kind}`, isCurrent && "diff-current")}>
          <td className="diff-no diff-left-no">{row.left?.no ?? ""}</td>
          <Cell cell={row.left} kind={row.kind} lang={lang} side="left" />
          <td className="diff-no diff-right-no">{row.right?.no ?? ""}</td>
          <Cell cell={row.right} kind={row.kind} lang={lang} side="right" />
        </tr>
      );
    }
    const lines: React.ReactNode[] = [];
    const sign = (value: string) => (
      <td className="diff-sign" aria-hidden="true">
        {value}
      </td>
    );
    if (row.kind === "equal") {
      lines.push(
        <tr key={`${index}e`} data-row={index} className="diff-row diff-equal">
          <td className="diff-no">{row.left?.no}</td>
          <td className="diff-no">{row.right?.no}</td>
          {sign(" ")}
          <Cell cell={row.right} kind="equal" lang={lang} side="right" />
        </tr>,
      );
    } else {
      if (row.left) {
        lines.push(
          <tr key={`${index}l`} data-row={index} className={cn("diff-row diff-remove", row.kind === "change" && "diff-unified-change", isCurrent && "diff-current")}>
            <td className="diff-no">{row.left.no}</td>
            <td className="diff-no" />
            {sign("−")}
            <Cell cell={row.left} kind={row.kind === "change" ? "change" : "remove"} lang={lang} side="left" />
          </tr>,
        );
      }
      if (row.right) {
        lines.push(
          <tr key={`${index}r`} className={cn("diff-row diff-add", row.kind === "change" && "diff-unified-change")}>
            <td className="diff-no" />
            <td className="diff-no">{row.right.no}</td>
            {sign("+")}
            <Cell cell={row.right} kind={row.kind === "change" ? "change" : "add"} lang={lang} side="right" />
          </tr>,
        );
      }
    }
    return lines;
  };

  const toggleClass = (active: boolean) =>
    cn(
      "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
      active ? "border-(--accent) bg-(--accent)/10 text-(--accent)" : "border-(--border) bg-(--bg) text-(--fg) hover:bg-(--surface)",
    );

  return (
    <div className={cn("flex min-h-0 flex-col", fill ? "h-full" : "")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--border) bg-(--bg) px-4 py-2.5">
        <p role="status" className="text-sm font-medium">
          {result ? (result.identical ? td(lang, "identical") : td(lang, "summary", { added: result.added, removed: result.removed })) : td(lang, "tooLarge")}
        </p>

        {result && !result.identical && (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => goTo(-1)} className={toggleClass(false)} aria-label={td(lang, "prev")} title={td(lang, "prev")}>
              <ChevronUp aria-hidden="true" className="size-4" />
            </button>
            <button type="button" onClick={() => goTo(1)} className={toggleClass(false)} aria-label={td(lang, "next")} title={td(lang, "next")}>
              <ChevronDown aria-hidden="true" className="size-4" />
            </button>
            <span className="text-xs text-(--muted-fg)" aria-live="polite">
              {current >= 0 ? td(lang, "changeOf", { current: current + 1, total: result.blocks.length }) : ""}
            </span>
          </div>
        )}

        <div role="group" aria-label={td(lang, "view")} className="flex gap-1.5">
          {(["split", "unified"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={toggleClass(mode === value)}>
              {td(lang, value)}
            </button>
          ))}
        </div>

        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">{td(lang, "options")}</legend>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} />
            {td(lang, "ignoreWhitespace")}
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={ignoreCase} onChange={(event) => setIgnoreCase(event.target.checked)} />
            {td(lang, "ignoreCase")}
          </label>
        </fieldset>

        {patch && <CopyButton lang={lang} text={patch} label={td(lang, "copyPatch")} className="ml-auto" />}
      </div>

      {result && !result.identical && (
        <div ref={bodyRef} className={cn("overflow-auto", fill ? "min-h-0 flex-1" : "max-h-[70vh]")}>
          <table className={cn("diff-table", mode === "unified" && "diff-table-unified")}>
            <caption className="sr-only">
              {leftName} → {rightName}
            </caption>
            {mode === "split" ? (
              <colgroup>
                <col className="diff-col-no" />
                <col />
                <col className="diff-col-no" />
                <col />
              </colgroup>
            ) : (
              <colgroup>
                <col className="diff-col-no" />
                <col className="diff-col-no" />
                <col className="diff-col-sign" />
                <col />
              </colgroup>
            )}
            <thead>
              <tr>
                {mode === "split" ? (
                  <>
                    <th scope="col" className="diff-head" colSpan={2}>
                      {leftName}
                    </th>
                    <th scope="col" className="diff-head" colSpan={2}>
                      {rightName}
                    </th>
                  </>
                ) : (
                  <th scope="col" className="diff-head" colSpan={4}>
                    {leftName} → {rightName}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {chunks.map((chunk) => {
                if (renderedRows >= MAX_RENDERED_ROWS) {
                  truncated = true;
                  return null;
                }
                if (chunk.type === "gap") {
                  renderedRows += 1;
                  return (
                    <tr key={`gap-${chunk.start}`} className="diff-gap">
                      <td colSpan={mode === "split" ? 4 : 4}>
                        <button type="button" onClick={() => setExpanded((previous) => new Set(previous).add(chunk.start))}>
                          {td(lang, "showLines", { count: chunk.length })}
                        </button>
                      </td>
                    </tr>
                  );
                }
                return chunk.rows.map((row, offset) => (renderedRows >= MAX_RENDERED_ROWS ? ((truncated = true), null) : renderRow(row, chunk.start + offset)));
              })}
            </tbody>
          </table>
          {truncated && <p className="p-3 text-xs text-(--muted-fg)">{td(lang, "truncated", { count: MAX_RENDERED_ROWS })}</p>}
        </div>
      )}
    </div>
  );
}
