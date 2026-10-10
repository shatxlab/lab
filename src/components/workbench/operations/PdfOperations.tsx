/**
 * The PDF operation family, extracted from the old Pdf tools tabs.
 *
 * Every operation seeds itself from the assets the workbench hands it and
 * falls back to its own file picker when rendered standalone. `readEntry` is
 * source-agnostic (`{ name, size, bytes() }`) so it can read both a picked
 * `File` and an `Asset` without duplicating the locked/wrong-password states.
 */

import * as React from "react";
import { ArrowDown, ArrowUp, Download, GripVertical, Loader2, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { zipSync } from "fflate";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  ActionButton,
  FilePicker,
  SelectField,
  inputClass,
  labelClass,
  panelClass,
} from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { formatBytesLimit, MAX_FILE_BYTES } from "@/lib/limits";
import { tp } from "@/lib/pdf/i18n";
import { countPages, extractPages, mergePdfs, organizePdf, PdfOpError, type PagePlan } from "@/lib/pdf/ops";
import { parsePageRanges, partLabel, planSplit, type RangeError, type SplitMode } from "@/lib/pdf/ranges";
import type { Asset } from "@/lib/workbench/asset";
import type { OperationProps } from "@/lib/workbench/operation";
import { useSeedAssets } from "@/lib/workbench/use-seed-assets";
import { baseFileName } from "@/lib/viewer/export";
import { cn, formatBytes } from "@/lib/viewer/utils";

/* ------------------------------------------------------- shared loading */

interface PdfEntry {
  id: number;
  name: string;
  size: number;
  bytes: Uint8Array;
  password?: string;
  /** Known after a successful (un)locked load. */
  pageCount?: number;
  state: "ready" | "locked" | "error";
  error?: string;
}

let nextId = 0;

/** A lazy byte source; a picked `File` or a workbench `Asset` both fit. */
interface PdfEntrySource {
  name: string;
  size: number;
  bytes: () => Promise<Uint8Array>;
}

function fileSource(file: File): PdfEntrySource {
  return {
    name: file.name,
    size: file.size,
    bytes: async () => new Uint8Array(await file.arrayBuffer()),
  };
}

function assetSource(asset: Asset): PdfEntrySource {
  return {
    name: asset.name,
    size: asset.size,
    bytes: () => asset.bytes(),
  };
}

function entrySource(entry: PdfEntry): PdfEntrySource {
  return {
    name: entry.name,
    size: entry.size,
    bytes: async () => entry.bytes,
  };
}

async function readEntry(lang: AppLang, source: PdfEntrySource, existing?: PdfEntry, password?: string): Promise<PdfEntry> {
  const base: PdfEntry = existing ?? { id: (nextId += 1), name: source.name, size: source.size, bytes: new Uint8Array(0), state: "error" };
  if (source.size > MAX_FILE_BYTES) {
    return { ...base, state: "error", error: tp(lang, "tooLarge", { name: source.name, limit: formatBytesLimit(MAX_FILE_BYTES) }) };
  }
  const bytes = existing?.bytes.length ? existing.bytes : await source.bytes();
  try {
    const pageCount = await countPages({ bytes, password });
    return { ...base, bytes, password, pageCount, state: "ready", error: undefined };
  } catch (error) {
    if (error instanceof PdfOpError && error.code === "needsPassword") return { ...base, bytes, state: "locked", error: undefined };
    if (error instanceof PdfOpError && error.code === "wrongPassword") return { ...base, bytes, state: "locked", error: tp(lang, "wrongPassword") };
    return { ...base, bytes, state: "error", error: tp(lang, "invalidPdf", { name: source.name }) };
  }
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isPdfAsset(asset: Asset): boolean {
  return asset.kind === "pdf" || asset.source.type === "application/pdf" || /\.pdf$/i.test(asset.name);
}

function describeRangeError(lang: AppLang, error: RangeError): string {
  if (error.kind === "empty") return tp(lang, "errEmpty");
  if (error.kind === "syntax") return tp(lang, "errSyntax", { token: error.token });
  return tp(lang, "errRange", { token: error.token, total: error.total });
}

function errorMessage(lang: AppLang, error: unknown): string {
  return tp(lang, "errGeneric", { message: error instanceof Error ? error.message : String(error) });
}

/** Let React paint a "working" state before a heavy synchronous step. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

function UnlockForm({ lang, entry, onUnlock }: { lang: AppLang; entry: PdfEntry; onUnlock: (password: string) => void }) {
  const [value, setValue] = React.useState("");
  const errorId = `unlock-error-${entry.id}`;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onUnlock(value);
      }}
    >
      <p className="text-sm">{tp(lang, "locked", { name: entry.name })}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className={cn(labelClass, "min-w-48 flex-1")}>
          {tp(lang, "password")}
          <input type="password" className={inputClass} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" aria-describedby={entry.error ? errorId : undefined} />
        </label>
        <ActionButton type="submit" disabled={value === ""}>
          {tp(lang, "unlock")}
        </ActionButton>
      </div>
      {entry.error && (
        <p id={errorId} role="alert" className="text-sm text-(--warning)">
          {entry.error}
        </p>
      )}
    </form>
  );
}

/* ----------------------------------------------------------------- merge */

interface MergeEntry extends PdfEntry {
  ranges: string;
}

export function PdfMergeOperation({ lang, assets, onProduce }: OperationProps) {
  const [entries, setEntries] = React.useState<MergeEntry[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ blob: Blob; pages: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const standalone = assets.length === 0;

  useSeedAssets(assets, async (list, isCancelled) => {
    const pdfs = list.filter(isPdfAsset);
    const loaded = await Promise.all(pdfs.map((asset) => readEntry(lang, assetSource(asset))));
    if (isCancelled()) return;
    setNotice(null);
    setResult(null);
    setEntries(loaded.map((entry) => ({ ...entry, ranges: "" })));
  });

  const add = async (files: File[]) => {
    setResult(null);
    const pdfs = files.filter(isPdfFile);
    setNotice(pdfs.length < files.length ? tp(lang, "onlyPdf") : null);
    for (const file of pdfs) {
      const entry = await readEntry(lang, fileSource(file));
      setEntries((current) => [...current, { ...entry, ranges: "" }]);
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    setResult(null);
    setEntries((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });
  };

  const unlock = async (id: number, password: string) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;
    const updated = await readEntry(lang, entrySource(entry), entry, password);
    setEntries((current) => current.map((item) => (item.id === id ? { ...updated, ranges: item.ranges } : item)));
  };

  const rangeFor = (entry: MergeEntry) => {
    if (entry.state !== "ready" || entry.ranges.trim() === "") return { ok: true as const, pages: null as number[] | null };
    return parsePageRanges(entry.ranges, entry.pageCount ?? 0);
  };

  const ready = entries.filter((entry) => entry.state === "ready");
  const allValid = entries.every((entry) => entry.state !== "locked" && rangeFor(entry).ok);
  const hasSelection = entries.some((entry) => entry.ranges.trim() !== "");
  const canMerge = ready.length >= 2 || (ready.length === 1 && hasSelection);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    await nextFrame();
    try {
      const parts = ready.map((entry) => {
        const range = rangeFor(entry);
        return { bytes: entry.bytes, password: entry.password, pages: range.ok ? range.pages : null };
      });
      const bytes = await mergePdfs(parts);
      const pages = ready.reduce((sum, entry, index) => sum + (parts[index]!.pages?.length ?? entry.pageCount ?? 0), 0);
      setResult({ blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), pages });
      onProduce?.({ name: "merged.pdf", type: "application/pdf", bytes, kind: "pdf" });
    } catch (failure) {
      setError(errorMessage(lang, failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {standalone && <FilePicker lang={lang} accept="application/pdf,.pdf" multiple prompt={tp(lang, "addPdfs")} onFiles={(files) => void add(files)} compact />}
      {notice && (
        <p role="alert" className="text-sm text-(--warning)">
          {notice}
        </p>
      )}

      {entries.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label={tp(lang, "tabMerge")}>
          {entries.map((entry, index) => {
            const range = rangeFor(entry);
            const rangeErrorId = `range-error-${entry.id}`;
            return (
              <li key={entry.id} className={cn(panelClass, "flex flex-col gap-3")}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-(--bg) text-xs font-semibold tabular-nums">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={entry.name}>
                      {entry.name}
                    </p>
                    <p className="text-xs text-(--muted-fg)">
                      {entry.pageCount !== undefined && <>{entry.pageCount === 1 ? tp(lang, "page1") : tp(lang, "pages", { count: entry.pageCount })} · </>}
                      {formatBytes(entry.size)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton label={tp(lang, "moveUp", { name: entry.name })} onClick={() => move(index, -1)} disabled={index === 0}>
                      <ArrowUp aria-hidden="true" className="size-4" />
                    </IconButton>
                    <IconButton label={tp(lang, "moveDown", { name: entry.name })} onClick={() => move(index, 1)} disabled={index === entries.length - 1}>
                      <ArrowDown aria-hidden="true" className="size-4" />
                    </IconButton>
                    <IconButton
                      label={tp(lang, "removeFile", { name: entry.name })}
                      onClick={() => {
                        setResult(null);
                        setEntries((current) => current.filter((item) => item.id !== entry.id));
                      }}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </IconButton>
                  </div>
                </div>
                {entry.state === "error" && (
                  <p role="alert" className="text-sm text-(--warning)">
                    {entry.error}
                  </p>
                )}
                {entry.state === "locked" && <UnlockForm lang={lang} entry={entry} onUnlock={(password) => void unlock(entry.id, password)} />}
                {entry.state === "ready" && (
                  <label className={labelClass}>
                    {tp(lang, "pagesRange")}
                    <input
                      className={inputClass}
                      value={entry.ranges}
                      placeholder={tp(lang, "pagesPlaceholder")}
                      aria-invalid={!range.ok}
                      aria-describedby={!range.ok ? rangeErrorId : undefined}
                      onChange={(event) => {
                        setResult(null);
                        setEntries((current) => current.map((item) => (item.id === entry.id ? { ...item, ranges: event.target.value } : item)));
                      }}
                    />
                    {!range.ok && (
                      <span id={rangeErrorId} role="alert" className="text-xs font-normal text-(--warning)">
                        {describeRangeError(lang, range.error)}
                      </span>
                    )}
                  </label>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton onClick={() => void run()} disabled={!canMerge || !allValid || busy}>
          {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {busy ? tp(lang, "merging") : tp(lang, "merge")}
        </ActionButton>
        {!canMerge && entries.length > 0 && <p className="text-sm text-(--muted-fg)">{tp(lang, "mergeNeed")}</p>}
      </div>
      <ResultBar lang={lang} error={error} done={result ? tp(lang, "mergeDone", { pages: result.pages, size: formatBytes(result.blob.size) }) : null} onDownload={result ? () => saveBlob(result.blob, tp(lang, "mergedName")) : undefined} />
    </>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-8 items-center justify-center rounded-md text-(--muted-fg) transition-colors hover:bg-(--bg) hover:text-(--fg) disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function ResultBar({ lang, error, done, onDownload, downloadLabel }: { lang: AppLang; error: string | null; done: string | null; onDownload?: () => void; downloadLabel?: string }) {
  return (
    <div aria-live="polite">
      {error && (
        <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
          {error}
        </p>
      )}
      {done && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--success)/40 bg-(--success)/10 p-3">
          <p className="text-sm font-medium text-(--success)">{done}</p>
          {onDownload && (
            <ActionButton onClick={onDownload}>
              <Download aria-hidden="true" className="size-4" />
              {downloadLabel ?? tp(lang, "download")}
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- split */

function SingleFileLoader({ lang, entry, onEntry, standalone = true }: { lang: AppLang; entry: PdfEntry | null; onEntry: (entry: PdfEntry | null) => void; standalone?: boolean }) {
  const [notice, setNotice] = React.useState<string | null>(null);
  return (
    <>
      {!entry && standalone && (
        <FilePicker
          lang={lang}
          accept="application/pdf,.pdf"
          prompt={tp(lang, "addPdf")}
          compact
          onFiles={async ([file]) => {
            if (!file) return;
            if (!isPdfFile(file)) {
              setNotice(tp(lang, "onlyPdf"));
              return;
            }
            setNotice(null);
            onEntry(await readEntry(lang, fileSource(file)));
          }}
        />
      )}
      {notice && (
        <p role="alert" className="text-sm text-(--warning)">
          {notice}
        </p>
      )}
      {entry && (
        <div className={cn(panelClass, "flex flex-col gap-3")}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={entry.name}>
                {entry.name}
              </p>
              <p className="text-xs text-(--muted-fg)">
                {entry.pageCount !== undefined && <>{entry.pageCount === 1 ? tp(lang, "page1") : tp(lang, "pages", { count: entry.pageCount })} · </>}
                {formatBytes(entry.size)}
              </p>
            </div>
            <IconButton label={tp(lang, "removeFile", { name: entry.name })} onClick={() => onEntry(null)}>
              <X aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
          {entry.state === "error" && (
            <p role="alert" className="text-sm text-(--warning)">
              {entry.error}
            </p>
          )}
          {entry.state === "locked" && <UnlockForm lang={lang} entry={entry} onUnlock={async (password) => onEntry(await readEntry(lang, entrySource(entry), entry, password))} />}
        </div>
      )}
    </>
  );
}

export function PdfSplitOperation({ lang, assets, onProduce }: OperationProps) {
  const [entry, setEntry] = React.useState<PdfEntry | null>(null);
  const [mode, setMode] = React.useState<SplitMode>("extract");
  const [ranges, setRanges] = React.useState("");
  const [every, setEvery] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ blob: Blob; name: string; count: number; zip: boolean } | null>(null);

  const standalone = assets.length === 0;

  useSeedAssets(assets, async (list, isCancelled) => {
    const first = list.find(isPdfAsset) ?? list[0];
    if (!first) return;
    setResult(null);
    setError(null);
    const loaded = await readEntry(lang, assetSource(first));
    if (isCancelled()) return;
    setEntry(loaded);
  });

  const total = entry?.state === "ready" ? (entry.pageCount ?? 0) : 0;
  const plan = React.useMemo(() => (total > 0 ? planSplit(total, mode, { ranges, every }) : null), [total, mode, ranges, every]);
  const planError = plan && !plan.ok && !(plan.error.kind === "empty" && ranges.trim() === "") ? describeRangeError(lang, plan.error) : null;

  const run = async () => {
    if (!entry || !plan?.ok) return;
    setBusy(true);
    setError(null);
    setResult(null);
    await nextFrame();
    try {
      const base = baseFileName(entry.name);
      const source = { bytes: entry.bytes, password: entry.password };
      if (plan.parts.length === 1) {
        const bytes = await extractPages(source, plan.parts[0]!);
        const label = mode === "extract" ? partLabel(plan.parts[0]!) : "all";
        const name = `${base}-${label}.pdf`;
        setResult({ blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), name, count: 1, zip: false });
        onProduce?.({ name, type: "application/pdf", bytes, kind: "pdf" });
      } else {
        const files: Record<string, Uint8Array> = {};
        const width = String(plan.parts.length).length;
        for (const [index, pages] of plan.parts.entries()) {
          files[`${base}-${String(index + 1).padStart(width, "0")}-p${partLabel(pages)}.pdf`] = await extractPages(source, pages);
        }
        // PDFs are already compressed; store them for speed.
        const bytes = zipSync(files, { level: 0 });
        const name = `${base}-split.zip`;
        setResult({ blob: new Blob([bytes as unknown as BlobPart], { type: "application/zip" }), name, count: plan.parts.length, zip: true });
        onProduce?.({ name, type: "application/zip", bytes, kind: "binary" });
      }
    } catch (failure) {
      setError(errorMessage(lang, failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SingleFileLoader
        lang={lang}
        entry={entry}
        standalone={standalone}
        onEntry={(next) => {
          setEntry(next);
          setResult(null);
          setError(null);
        }}
      />

      {entry?.state === "ready" && (
        <div className={cn(panelClass, "flex flex-col gap-4")}>
          <SelectField
            label={tp(lang, "splitMode")}
            value={mode}
            onChange={(value) => {
              setMode(value as SplitMode);
              setResult(null);
            }}
            options={[
              { value: "extract", label: tp(lang, "splitExtract") },
              { value: "single", label: tp(lang, "splitSingle") },
              { value: "every", label: tp(lang, "splitEvery") },
              { value: "ranges", label: tp(lang, "splitRanges") },
            ]}
          />
          {mode === "extract" && (
            <label className={labelClass}>
              {tp(lang, "extractPages")}
              <input className={inputClass} value={ranges} onChange={(event) => setRanges(event.target.value)} placeholder="1-3, 7" aria-invalid={planError !== null} aria-describedby="split-hint" />
              <span id="split-hint" className="text-xs font-normal text-(--muted-fg)">
                {tp(lang, "extractHint")}
              </span>
            </label>
          )}
          {mode === "every" && (
            <label className={labelClass}>
              {tp(lang, "everyN")}
              <input type="number" min={1} max={total} className={cn(inputClass, "max-w-32")} value={every} onChange={(event) => setEvery(Math.max(1, Number(event.target.value) || 1))} />
            </label>
          )}
          {mode === "ranges" && (
            <label className={labelClass}>
              {tp(lang, "customRanges")}
              <textarea className={cn(inputClass, "min-h-24 font-mono")} value={ranges} onChange={(event) => setRanges(event.target.value)} placeholder={"1-3\n4-6, 9"} aria-invalid={planError !== null} aria-describedby="split-hint" />
              <span id="split-hint" className="text-xs font-normal text-(--muted-fg)">
                {tp(lang, "customHint")}
              </span>
            </label>
          )}
          {planError && (
            <p role="alert" className="text-sm text-(--warning)">
              {planError}
            </p>
          )}
          {plan?.ok && <p className="text-sm text-(--muted-fg)">{plan.parts.length === 1 ? tp(lang, "willCreateOne") : tp(lang, "willCreate", { count: plan.parts.length })}</p>}
          <ActionButton className="self-start" onClick={() => void run()} disabled={!plan?.ok || busy}>
            {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {busy ? tp(lang, "merging") : tp(lang, "split")}
          </ActionButton>
        </div>
      )}

      <ResultBar
        lang={lang}
        error={error}
        done={result ? (result.count === 1 ? tp(lang, "splitDoneOne", { size: formatBytes(result.blob.size) }) : tp(lang, "splitDone", { count: result.count, size: formatBytes(result.blob.size) })) : null}
        onDownload={result ? () => saveBlob(result.blob, result.name) : undefined}
        downloadLabel={result?.zip ? tp(lang, "downloadZip") : undefined}
      />
    </>
  );
}

/* -------------------------------------------------------------- organize */

interface PageCard extends PagePlan {
  /** Stable React key; survives re-ordering. */
  key: number;
}

export function PdfOrganizeOperation({ lang, assets, onProduce }: OperationProps) {
  const [entry, setEntry] = React.useState<PdfEntry | null>(null);
  const [cards, setCards] = React.useState<PageCard[]>([]);
  const [doc, setDoc] = React.useState<PDFDocumentProxy | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<{ blob: Blob; pages: number } | null>(null);
  const [dragKey, setDragKey] = React.useState<number | null>(null);
  const [overKey, setOverKey] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState("");

  const standalone = assets.length === 0;

  useSeedAssets(assets, async (list, isCancelled) => {
    const first = list.find(isPdfAsset) ?? list[0];
    if (!first) return;
    setError(null);
    setSaved(null);
    const loaded = await readEntry(lang, assetSource(first));
    if (isCancelled()) return;
    setEntry(loaded);
  });

  const total = entry?.state === "ready" ? (entry.pageCount ?? 0) : 0;

  const reset = React.useCallback((count: number) => {
    setCards(Array.from({ length: count }, (_, index) => ({ key: index, source: index, rotate: 0 })));
    setSaved(null);
  }, []);

  React.useEffect(() => {
    reset(total);
  }, [total, entry?.id, reset]);

  // A pdf.js document for thumbnails, replaced (and destroyed) with the file.
  React.useEffect(() => {
    if (!entry || entry.state !== "ready") {
      setDoc(null);
      return;
    }
    let cancelled = false;
    let opened: PDFDocumentProxy | undefined;
    void import("@/lib/viewer/pdf")
      .then(({ openPdf }) => openPdf(entry.bytes, entry.password))
      .then((pdf) => {
        if (cancelled) {
          void pdf.loadingTask.destroy();
          return;
        }
        opened = pdf;
        setDoc(pdf);
      })
      .catch(() => setDoc(null));
    return () => {
      cancelled = true;
      if (opened) void opened.loadingTask.destroy();
    };
  }, [entry]);

  const edit = (updater: (current: PageCard[]) => PageCard[]) => {
    setSaved(null);
    setCards(updater);
  };

  const moveTo = (from: number, to: number) => {
    edit((current) => {
      if (to < 0 || to >= current.length || from === to) return current;
      const copy = [...current];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved!);
      return copy;
    });
  };

  const rotate = (key: number, delta: number) => edit((current) => current.map((card) => (card.key === key ? { ...card, rotate: (card.rotate + delta + 360) % 360 } : card)));

  const save = async () => {
    if (!entry || cards.length === 0) return;
    setBusy(true);
    setError(null);
    await nextFrame();
    try {
      const bytes = await organizePdf({ bytes: entry.bytes, password: entry.password }, cards);
      setSaved({ blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), pages: cards.length });
      onProduce?.({ name: tp(lang, "savedName", { name: baseFileName(entry.name) }), type: "application/pdf", bytes, kind: "pdf" });
    } catch (failure) {
      setError(errorMessage(lang, failure));
    } finally {
      setBusy(false);
    }
  };

  const announce = (message: string) => setStatus(message);

  return (
    <>
      <SingleFileLoader
        lang={lang}
        entry={entry}
        standalone={standalone}
        onEntry={(next) => {
          setEntry(next);
          setError(null);
          setSaved(null);
        }}
      />

      {entry?.state === "ready" && (
        <>
          <p className="text-sm text-(--muted-fg)">{tp(lang, "organizeHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton onClick={() => void save()} disabled={busy || cards.length === 0}>
              {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {busy ? tp(lang, "merging") : tp(lang, "save")}
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => edit((current) => [...current].reverse())}>
              {tp(lang, "reverse")}
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => reset(total)}>
              <RotateCcw aria-hidden="true" className="size-4" />
              {tp(lang, "reset")}
            </ActionButton>
            <span className="text-sm text-(--muted-fg)">{tp(lang, "keptPages", { count: cards.length, total })}</span>
          </div>
          {cards.length === 0 && (
            <p role="status" className="text-sm text-(--warning)">
              {tp(lang, "nothingLeft")}
            </p>
          )}

          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" aria-label={tp(lang, "tabOrganize")}>
            {cards.map((card, index) => (
              <li
                key={card.key}
                draggable
                onDragStart={(event) => {
                  setDragKey(card.key);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(card.key));
                }}
                onDragOver={(event) => {
                  if (dragKey === null) return;
                  event.preventDefault();
                  setOverKey(card.key);
                }}
                onDragLeave={() => setOverKey((current) => (current === card.key ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = cards.findIndex((item) => item.key === dragKey);
                  if (from >= 0) moveTo(from, index);
                  setDragKey(null);
                  setOverKey(null);
                }}
                onDragEnd={() => {
                  setDragKey(null);
                  setOverKey(null);
                }}
                className={cn(panelClass, "flex flex-col gap-2 p-2", dragKey === card.key && "opacity-40", overKey === card.key && dragKey !== card.key && "outline-2 outline-(--accent)")}
              >
                <div className="flex items-center justify-between gap-1 text-xs text-(--muted-fg)">
                  <GripVertical aria-hidden="true" className="size-4 cursor-grab" />
                  <span className="tabular-nums">{index + 1}</span>
                  <span className="sr-only">{tp(lang, "pagePosition", { position: index + 1, total: cards.length })}</span>
                </div>
                <PageThumb doc={doc} pageIndex={card.source} rotate={card.rotate} label={tp(lang, "pageLabel", { n: card.source + 1 })} />
                <p className="text-center text-xs text-(--muted-fg)">{tp(lang, "pageLabel", { n: card.source + 1 })}</p>
                <div className="flex justify-center gap-0.5">
                  <IconButton
                    label={tp(lang, "moveEarlier", { n: card.source + 1 })}
                    disabled={index === 0}
                    onClick={() => {
                      moveTo(index, index - 1);
                      announce(tp(lang, "pagePosition", { position: index, total: cards.length }));
                    }}
                  >
                    <ArrowUp aria-hidden="true" className="size-4 -rotate-90" />
                  </IconButton>
                  <IconButton
                    label={tp(lang, "moveLater", { n: card.source + 1 })}
                    disabled={index === cards.length - 1}
                    onClick={() => {
                      moveTo(index, index + 1);
                      announce(tp(lang, "pagePosition", { position: index + 2, total: cards.length }));
                    }}
                  >
                    <ArrowDown aria-hidden="true" className="size-4 -rotate-90" />
                  </IconButton>
                  <IconButton label={tp(lang, "rotateLeft", { n: card.source + 1 })} onClick={() => rotate(card.key, -90)}>
                    <RotateCcw aria-hidden="true" className="size-4" />
                  </IconButton>
                  <IconButton label={tp(lang, "rotateRight", { n: card.source + 1 })} onClick={() => rotate(card.key, 90)}>
                    <RotateCw aria-hidden="true" className="size-4" />
                  </IconButton>
                  <IconButton
                    label={tp(lang, "deletePage", { n: card.source + 1 })}
                    onClick={() => {
                      edit((current) => current.filter((item) => item.key !== card.key));
                      announce(tp(lang, "keptPages", { count: cards.length - 1, total }));
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
          <p role="status" className="sr-only">
            {status}
          </p>
        </>
      )}

      <ResultBar
        lang={lang}
        error={error}
        done={saved ? tp(lang, "saved", { pages: saved.pages, size: formatBytes(saved.blob.size) }) : null}
        onDownload={saved && entry ? () => saveBlob(saved.blob, tp(lang, "savedName", { name: baseFileName(entry.name) })) : undefined}
      />
    </>
  );
}

const THUMB_WIDTH = 160;

/** A page thumbnail, drawn by pdf.js only once it scrolls into view. */
function PageThumb({ doc, pageIndex, rotate, label }: { doc: PDFDocumentProxy | null; pageIndex: number; rotate: number; label: string }) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [ratio, setRatio] = React.useState(1.4);
  const [drawn, setDrawn] = React.useState(false);

  React.useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([hit]) => hit?.isIntersecting && setVisible(true), { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !doc || !canvas) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<unknown> } | undefined;
    (async () => {
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = (THUMB_WIDTH * (window.devicePixelRatio || 1)) / base.width;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        setRatio(base.height / base.width);
        const context = canvas.getContext("2d");
        if (!context) return;
        task = page.render({ canvasContext: context, canvas, viewport });
        await task.promise;
        if (!cancelled) setDrawn(true);
        page.cleanup();
      } catch {
        // A thumbnail that fails to draw simply stays blank.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, doc, pageIndex]);

  // Rotating by 90° swaps the box: draw into a square-ish cell and rotate the canvas.
  const quarter = rotate % 180 !== 0;
  return (
    <div ref={wrapperRef} className="flex items-center justify-center overflow-hidden rounded-sm bg-(--bg)" style={{ aspectRatio: "1 / 1.25" }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className={cn("bg-white shadow-sm transition-transform", !drawn && "opacity-0")}
        style={{
          transform: `rotate(${rotate}deg)`,
          maxWidth: quarter ? `${100 / ratio}%` : "100%",
          maxHeight: quarter ? "100%" : "100%",
          height: "auto",
          width: quarter ? "auto" : "100%",
          aspectRatio: `1 / ${ratio}`,
        }}
      />
    </div>
  );
}
