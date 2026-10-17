/**
 * The results of reading many pictures: a summary with the controls to run,
 * stop and download, and one row per picture, a page at a time. Only the text
 * is kept for each picture (not word positions or page images), so a long batch
 * stays light.
 */

import * as React from "react";
import { Download } from "lucide-react";

import { ShowMore } from "@/components/workbench/ShowMore";
import { ActionButton, CopyButton, panelClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { toc } from "@/lib/ocr/i18n";
import { PAGE_SIZE, imagesLabel } from "@/lib/workbench/batch";
import { archiveNames, zipBlobs } from "@/lib/workbench/zip";
import { cn } from "@/lib/viewer/utils";

export interface OcrBatchItem {
  id: number;
  /** The picture's own name. */
  source: string;
  /** The name of the file its text is saved as. */
  name: string;
  status: "waiting" | "working" | "done" | "error";
  /** The text read, or the table as CSV. */
  text?: string;
  csv?: boolean;
  rows?: number;
  confidence?: number;
}

const mimeOf = (item: OcrBatchItem) => (item.csv ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8");

export interface BatchRunInfo {
  running: boolean;
  /** Which stage the engine is in, while it is not yet reading a file. */
  starting: "engine" | "language" | "start" | null;
}

export interface OcrBatchResultsProps {
  lang: AppLang;
  items: readonly OcrBatchItem[];
  run: BatchRunInfo;
  /** Whether the engine files are in place and the options are valid. */
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function OcrBatchResults({ lang, items, run, canStart, onStart, onStop }: OcrBatchResultsProps) {
  const [shown, setShown] = React.useState(PAGE_SIZE);
  const [packing, setPacking] = React.useState(false);
  const showMore = React.useCallback(() => setShown((current) => current + PAGE_SIZE), []);

  const total = items.length;
  const finished = items.filter((item) => item.status === "done");
  const read = finished.length;
  const remaining = total - read;
  const withText = finished.filter((item) => (item.text ?? "") !== "");

  const downloadZip = async () => {
    setPacking(true);
    try {
      const archives = await zipBlobs(withText.map((item) => ({ name: item.name, blob: new Blob([item.text!], { type: mimeOf(item) }) })));
      const names = archiveNames("recognized-text", archives.length);
      archives.forEach((blob, index) => window.setTimeout(() => saveBlob(blob, names[index]!), index * 400));
    } finally {
      setPacking(false);
    }
  };

  const downloadOne = () => {
    const joined = withText
      .filter((item) => !item.csv)
      .map((item) => `--- ${item.source} ---\n${item.text!.trim()}\n`)
      .join("\n");
    saveBlob(new Blob([joined], { type: "text/plain;charset=utf-8" }), "recognized-text.txt");
  };

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="ocr-batch-results">
      <h2 id="ocr-batch-results" className="text-sm font-semibold">
        {toc(lang, "batchResults")} <span className="font-normal text-(--muted-fg)">({total.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")})</span>
      </h2>

      <div className={cn(panelClass, "flex flex-col gap-3")} data-batch-bar="">
        {read === 0 && !run.running && <p className="text-xs text-(--muted-fg)">{toc(lang, "batchHint")}</p>}
        {(read > 0 || run.running) && (
          <div className="flex flex-col gap-1.5">
            <p role="status" className="text-sm font-medium">
              {run.running && run.starting
                ? toc(lang, run.starting === "engine" ? "stageEngine" : run.starting === "language" ? "stageLanguage" : "stageStart")
                : run.running
                  ? toc(lang, "batchProgress", { done: read, total })
                  : toc(lang, "batchDone", { done: read, total })}
            </p>
            <progress className="w-full" value={read} max={total} aria-label={toc(lang, "batchProgress", { done: read, total })} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {run.running ? (
            <ActionButton variant="secondary" onClick={onStop}>
              {toc(lang, "stop")}
            </ActionButton>
          ) : (
            remaining > 0 && (
              <ActionButton onClick={onStart} disabled={!canStart}>
                {toc(lang, read > 0 ? "batchRest" : "batchRecognize", { count: imagesLabel(lang, remaining) })}
              </ActionButton>
            )
          )}
          {withText.length > 1 && (
            <ActionButton variant="secondary" disabled={packing} onClick={() => void downloadZip()}>
              <Download aria-hidden="true" className="size-4" />
              {toc(lang, "downloadZip")}
            </ActionButton>
          )}
          {withText.some((item) => !item.csv) && withText.length > 1 && (
            <ActionButton variant="secondary" onClick={downloadOne}>
              <Download aria-hidden="true" className="size-4" />
              {toc(lang, "downloadOneText")}
            </ActionButton>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {items.slice(0, shown).map((item) => (
          <BatchRow key={item.id} lang={lang} item={item} />
        ))}
      </ul>
      {items.length > shown && <ShowMore label={toc(lang, "showMore", { n: Math.min(PAGE_SIZE, items.length - shown), left: items.length - shown })} onMore={showMore} />}
    </section>
  );
}

/** The first line with anything on it, cut to fit one line. */
function preview(text: string): string {
  const line = text.split("\n").find((candidate) => candidate.trim() !== "") ?? "";
  return line.length > 100 ? `${line.slice(0, 100)}…` : line;
}

const BatchRow = React.memo(function BatchRow({ lang, item }: { lang: AppLang; item: OcrBatchItem }) {
  const text = item.text ?? "";
  return (
    <li className={cn(panelClass, "flex flex-col gap-2")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate font-medium" title={item.source}>
            {item.source}
          </p>
          {item.status === "waiting" && <p className="text-sm text-(--muted-fg)">{toc(lang, "batchWaiting")}</p>}
          {item.status === "working" && (
            <p role="status" className="text-sm text-(--muted-fg)">
              {toc(lang, "batchReading")}
            </p>
          )}
          {item.status === "error" && (
            <p role="alert" className="text-sm text-(--warning)">
              {toc(lang, "imageFailed")}
            </p>
          )}
          {item.status === "done" && text === "" && <p className="text-sm text-(--muted-fg)">{toc(lang, "batchNothing")}</p>}
          {item.status === "done" && text !== "" && (
            <p className="text-xs text-(--muted-fg)">
              {item.csv ? toc(lang, "batchTable", { rows: item.rows ?? 0 }) : toc(lang, "confidence", { n: Math.round(item.confidence ?? 0) })}
            </p>
          )}
        </div>
        {item.status === "done" && text !== "" && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!item.csv && <CopyButton lang={lang} text={text} />}
            <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => saveBlob(new Blob([text], { type: mimeOf(item) }), item.name)}>
              <Download aria-hidden="true" className="size-3.5" />
              {item.name}
            </ActionButton>
          </div>
        )}
      </div>
      {item.status === "done" && text !== "" && (
        <details className="text-sm">
          <summary className="cursor-pointer truncate text-(--muted-fg)">{preview(text)}</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-(--border) bg-(--bg) p-3 font-sans text-sm">{text}</pre>
        </details>
      )}
    </li>
  );
});
