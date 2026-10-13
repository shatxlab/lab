/**
 * `ocr.recognize` — read the text in a picture or the pages of a PDF. The engine
 * (tesseract, in a web worker) and its language data are about 10 MB, so they are
 * downloaded on request, with their real sizes shown, kept in a cache of their
 * own and removable. Nothing is ever sent anywhere: the files come from this site
 * and the recognition happens on this device. The result is added to the Outputs
 * tray as a text file.
 */

import * as React from "react";

import { imageMime } from "@/components/viewer/viewers/ImageView";
import { ActionButton, CopyButton, SelectField, inputClass, labelClass, panelClass, textareaClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { OCR_CACHE, cacheSupported, cachedFiles, downloadFiles, removeFiles, totalSize } from "@/lib/apps/heavy-assets";
import { LANGUAGE_NAMES, allFiles, loadManifest, planFor, supportsSimd, type OcrManifest } from "@/lib/ocr/assets";
import { toc } from "@/lib/ocr/i18n";
import { DEFAULT_PREPROCESS, type PreprocessOptions } from "@/lib/ocr/preprocess";
import { OcrWords } from "@/components/workbench/operations/OcrWords";
import { tableToCsv } from "@/lib/ocr/layout";
import { LAYOUTS, MAX_PDF_PAGES, runOcr, type Layout, type OcrProgress, type OcrResult } from "@/lib/ocr/run";
import { parsePageRanges } from "@/lib/pdf/ranges";
import { cn, formatBytes } from "@/lib/viewer/utils";
import type { OperationProps } from "@/lib/workbench/operation";

type Manifest = { status: "loading" } | { status: "missing" } | { status: "ready"; manifest: OcrManifest };
type Run =
  | { status: "idle" }
  | { status: "downloading"; loaded: number; total: number }
  | { status: "running"; progress: OcrProgress | null }
  | { status: "done"; result: OcrResult; name: string; csv: boolean }
  | { status: "error"; message: string };

const supported = (): boolean => typeof WebAssembly === "object" && typeof Worker !== "undefined";
const baseName = (name: string): string => name.replace(/\.[^./\\]+$/, "") || "text";

function stageLabel(lang: AppLang, progress: OcrProgress | null): string {
  if (!progress) return toc(lang, "stageStart");
  const params = { page: progress.page, pages: progress.pages };
  switch (progress.stage) {
    case "engine":
      return toc(lang, "stageEngine");
    case "language":
      return toc(lang, "stageLanguage");
    case "render":
      return toc(lang, "stageRender", params);
    case "recognizing":
      return toc(lang, "stageRecognizing", params);
    default:
      return toc(lang, "stageStart");
  }
}

export function OcrOperation({ lang, assets, params, setParams, onProduce }: OperationProps) {
  const asset = assets[0];
  const isPdf = asset?.kind === "pdf";
  const [manifest, setManifest] = React.useState<Manifest>({ status: "loading" });
  const [cached, setCached] = React.useState<Set<string>>(new Set());
  const [run, setRun] = React.useState<Run>({ status: "idle" });
  const [pageCount, setPageCount] = React.useState(0);
  const [pagesText, setPagesText] = React.useState("all");
  const abort = React.useRef<AbortController | null>(null);
  const [note, setNote] = React.useState("");

  const preprocess: PreprocessOptions = {
    contrast: params?.contrast !== false,
    blackWhite: params?.blackWhite === true,
    enlarge: params?.enlarge !== false,
  };
  const markPages = params?.markPages !== false;
  const straighten = params?.straighten !== false;
  const layout: Layout = LAYOUTS.includes(params?.layout as Layout) ? (params!.layout as Layout) : "auto";
  const simd = React.useMemo(() => supportsSimd(), []);

  // What this build ships.
  React.useEffect(() => {
    let cancelled = false;
    void loadManifest().then((loaded) => {
      if (!cancelled) setManifest(loaded ? { status: "ready", manifest: loaded } : { status: "missing" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = manifest.status === "ready" ? manifest.manifest.languages.map((l) => l.code) : [];
  const stored = Array.isArray(params?.languages) ? (params.languages as unknown[]).filter((c): c is string => typeof c === "string") : null;
  const languages = (stored ?? (lang === "ru" ? ["rus", "eng"] : ["eng"])).filter((code) => available.includes(code));
  const chosen = languages.length > 0 ? languages : available.slice(0, 1);
  const plan = manifest.status === "ready" ? planFor(manifest.manifest, chosen, simd) : null;

  const refresh = React.useCallback(async () => {
    if (manifest.status !== "ready") return;
    setCached(await cachedFiles(allFiles(manifest.manifest)));
  }, [manifest]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // A PDF's page count, to check the page range against.
  React.useEffect(() => {
    if (!asset || !isPdf) return;
    let cancelled = false;
    void asset
      .pdf()
      .then((doc) => {
        if (!cancelled) setPageCount(doc.numPages);
      })
      .catch(() => {
        if (!cancelled) setPageCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, isPdf]);

  // Leaving the tab stops anything in progress.
  React.useEffect(() => () => abort.current?.abort(), []);

  if (!asset) return null;
  if (!supported()) return <p className="text-sm text-(--warning)">{toc(lang, "unsupported")}</p>;
  if (manifest.status === "loading") return <p className="text-sm text-(--muted-fg)">{toc(lang, "loadingManifest")}</p>;
  if (manifest.status === "missing" || !plan) return <p className="text-sm text-(--muted-fg)">{toc(lang, "unavailable")}</p>;

  const canCache = cacheSupported();
  const missing = plan.files.filter((file) => !cached.has(file.url));
  const ready = missing.length === 0 || !canCache;
  const anyCached = cached.size > 0;
  const busy = run.status === "downloading" || run.status === "running";

  const pageSelection = isPdf && pageCount > 0 ? parsePageRanges(pagesText, pageCount) : null;
  const pagesError = pageSelection && !pageSelection.ok ? pageSelection.error : null;
  const pageList = pageSelection && pageSelection.ok ? pageSelection.pages : [];
  const tooMany = pageList.length > MAX_PDF_PAGES;
  const pagesInvalid = isPdf && (pagesError !== null || tooMany || (pageCount > 0 && pageList.length === 0));

  const toggleLanguage = (code: string, on: boolean) => {
    const next = on ? [...chosen, code] : chosen.filter((c) => c !== code);
    if (next.length > 0) setParams?.({ languages: available.filter((c) => next.includes(c)) });
  };

  const download = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setNote("");
    setRun({ status: "downloading", loaded: 0, total: totalSize(missing) });
    try {
      await downloadFiles(plan.files, { signal: controller.signal, onProgress: (p) => setRun({ status: "downloading", loaded: p.loaded, total: p.total }) });
      setRun({ status: "idle" });
    } catch (error) {
      setRun(error instanceof DOMException && error.name === "AbortError" ? { status: "idle" } : { status: "error", message: toc(lang, "downloadFailed") });
    } finally {
      abort.current = null;
      await refresh();
    }
  };

  const recognize = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setNote("");
    setRun({ status: "running", progress: null });
    try {
      let source;
      if (isPdf) source = { kind: "pdf" as const, pdf: await asset.pdf(), pages: pageList };
      else source = { kind: "image" as const, blob: new Blob([(await asset.bytes()) as unknown as BlobPart], { type: imageMime(asset.extension) }) };
      const result = await runOcr({
        source,
        languages: chosen,
        plan,
        preprocess,
        straighten,
        layout,
        markPages,
        signal: controller.signal,
        onProgress: (progress) => setRun({ status: "running", progress }),
      });
      // A table becomes a spreadsheet the workbench can open and chart; anything else is text.
      const csv = result.table !== null;
      const name = `${baseName(asset.name)}.${csv ? "csv" : "txt"}`;
      setRun({ status: "done", result, name, csv });
      if (result.table && result.table.length > 0) {
        onProduce?.({ name, type: "text/csv;charset=utf-8", bytes: new TextEncoder().encode(tableToCsv(result.table)), kind: "sheet" });
      } else if (!csv && result.text.trim() !== "") {
        onProduce?.({ name, type: "text/plain;charset=utf-8", bytes: new TextEncoder().encode(result.text), kind: "text" });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setRun({ status: "idle" }), setNote(toc(lang, "stopped"));
      else setRun({ status: "error", message: toc(lang, "failed", { detail: error instanceof Error ? error.message : String(error) }) });
    } finally {
      abort.current = null;
    }
  };

  const check = (key: "contrast" | "blackWhite" | "enlarge" | "markPages", hint?: "contrastHint" | "blackWhiteHint") => {
    const on = key === "markPages" ? markPages : preprocess[key];
    return (
      <label key={key} className="flex flex-col gap-0.5 text-sm font-medium">
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={on} disabled={busy} onChange={(event) => setParams?.({ [key]: event.target.checked })} />
          {toc(lang, key)}
        </span>
        {hint && <span className="pl-6 text-xs font-normal text-(--muted-fg)">{toc(lang, hint)}</span>}
      </label>
    );
  };

  const progress = run.status === "running" ? run.progress : null;
  const fraction = run.status === "downloading" ? (run.total > 0 ? run.loaded / run.total : 0) : (progress?.fraction ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--muted-fg)">{toc(lang, "intro")}</p>

      <fieldset className={cn(panelClass, "flex flex-col gap-2")} disabled={busy}>
        <legend className="px-1 text-sm font-semibold">{toc(lang, "languages")}</legend>
        {manifest.manifest.languages.map((language) => (
          <label key={language.code} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={chosen.includes(language.code)} onChange={(event) => toggleLanguage(language.code, event.target.checked)} />
            {toc(lang, "languageSize", { name: LANGUAGE_NAMES[language.code]?.[lang] ?? language.code, size: formatBytes(language.size) })}
          </label>
        ))}
        <p className="text-xs text-(--muted-fg)">{toc(lang, "languagesHint")}</p>
      </fieldset>

      <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="ocr-files">
        <h2 id="ocr-files" className="text-sm font-semibold">
          {toc(lang, "files")}
        </h2>
        <p className="text-xs text-(--muted-fg)">{toc(lang, "filesIntro", { size: formatBytes(totalSize(plan.files)) })}</p>
        {!canCache && <p className="text-xs text-(--warning)">{toc(lang, "noCache")}</p>}
        {canCache && (
          <p className="text-sm" data-testid="ocr-status">
            {missing.length === 0 ? toc(lang, "ready") : toc(lang, "missing", { size: formatBytes(totalSize(missing)) })}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {canCache && missing.length > 0 && run.status !== "downloading" && (
            <ActionButton onClick={() => void download()} disabled={busy}>
              {toc(lang, "download", { size: formatBytes(totalSize(missing)) })}
            </ActionButton>
          )}
          {run.status === "downloading" && (
            <ActionButton variant="secondary" onClick={() => abort.current?.abort()}>
              {toc(lang, "cancel")}
            </ActionButton>
          )}
          {canCache && anyCached && !busy && (
            <ActionButton
              variant="secondary"
              onClick={async () => {
                await removeFiles(allFiles(manifest.manifest), OCR_CACHE);
                setNote(toc(lang, "removed"));
                await refresh();
              }}
            >
              {toc(lang, "removeAll")}
            </ActionButton>
          )}
        </div>
        {run.status === "downloading" && (
          <label className="flex flex-col gap-1 text-xs text-(--muted-fg)">
            {toc(lang, "downloading", { done: formatBytes(run.loaded), total: formatBytes(run.total) })}
            <progress className="w-full" value={fraction} max={1} />
          </label>
        )}
      </section>

      <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="ocr-options">
        <h2 id="ocr-options" className="text-sm font-semibold">
          {toc(lang, "options")}
        </h2>
        {check("contrast", "contrastHint")}
        {check("blackWhite", "blackWhiteHint")}
        {check("enlarge")}
        <label className="flex flex-col gap-0.5 text-sm font-medium">
          <span className="flex items-center gap-2">
            <input type="checkbox" checked={straighten} disabled={busy} onChange={(event) => setParams?.({ straighten: event.target.checked })} />
            {toc(lang, "straighten")}
          </span>
          <span className="pl-6 text-xs font-normal text-(--muted-fg)">{toc(lang, "straightenHint")}</span>
        </label>
        <div className="flex flex-col gap-1">
          <SelectField
            label={toc(lang, "layout")}
            value={layout}
            onChange={(value) => setParams?.({ layout: value })}
            options={[
              { value: "auto", label: toc(lang, "layoutAuto") },
              { value: "columns", label: toc(lang, "layoutColumns") },
              { value: "block", label: toc(lang, "layoutBlock") },
              { value: "table", label: toc(lang, "layoutTable") },
            ]}
          />
          <span className="text-xs text-(--muted-fg)">{toc(lang, "layoutHint")}</span>
        </div>
        {isPdf && check("markPages")}
        {isPdf && (
          <label className={labelClass}>
            {toc(lang, "pages")}
            <input className={inputClass} value={pagesText} disabled={busy} onChange={(event) => setPagesText(event.target.value)} aria-invalid={pagesInvalid} />
            <span className={cn("text-xs font-normal", pagesInvalid ? "text-(--warning)" : "text-(--muted-fg)")}>
              {pagesInvalid && pagesError ? toc(lang, "pagesInvalid", { detail: pagesError.kind === "outOfRange" ? `${pagesError.token} / ${pagesError.total}` : pagesError.kind === "syntax" ? pagesError.token : "—" }) : toc(lang, "pagesHint", { max: MAX_PDF_PAGES, count: pageCount })}
            </span>
          </label>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {run.status !== "running" ? (
          <ActionButton onClick={() => void recognize()} disabled={!ready || busy || pagesInvalid}>
            {toc(lang, "recognize")}
          </ActionButton>
        ) : (
          <ActionButton variant="secondary" onClick={() => abort.current?.abort()}>
            {toc(lang, "stop")}
          </ActionButton>
        )}
        {run.status === "running" && (
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
            <span role="status">{stageLabel(lang, progress)}</span>
            <progress className="w-full" value={fraction} max={1} />
          </label>
        )}
      </div>

      {note && (
        <p className="text-sm text-(--muted-fg)" role="status">
          {note}
        </p>
      )}
      {run.status === "error" && (
        <p className="text-sm text-(--warning)" role="alert">
          {run.message}
        </p>
      )}

      {run.status === "done" && (
        <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="ocr-result">
          <h2 id="ocr-result" className="text-sm font-semibold">
            {toc(lang, "result")}
          </h2>
          {run.csv ? (
            run.result.table && run.result.table.length > 0 ? (
              <>
                <p className="text-sm font-medium">{toc(lang, "tableFound", { rows: run.result.table.length, cols: run.result.table[0]!.length })}</p>
                <div className="max-h-80 overflow-auto rounded-lg border border-(--border)">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">{toc(lang, "tableCaption")}</caption>
                    <tbody>
                      {run.result.table.slice(0, 200).map((row, r) => (
                        <tr key={r} className="odd:bg-(--bg)">
                          {row.map((cell, c) => (
                            <td key={c} className="border-b border-(--border) px-3 py-1.5">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-(--muted-fg)">{toc(lang, "addedCsv", { name: run.name })}</p>
              </>
            ) : (
              <p className="text-sm text-(--muted-fg)">{toc(lang, "tableNone")}</p>
            )
          ) : run.result.text.trim() === "" ? (
            <p className="text-sm text-(--muted-fg)">{toc(lang, "nothing")}</p>
          ) : (
            <>
              <textarea className={cn(textareaClass, "min-h-48 font-sans")} readOnly value={run.result.text} aria-label={toc(lang, "result")} />
              <div className="flex flex-wrap items-center gap-3 text-xs text-(--muted-fg)">
                <CopyButton lang={lang} text={run.result.text} />
                <span>{toc(lang, "confidence", { n: Math.round(run.result.confidence) })}</span>
                {run.result.pages > 1 && <span>{toc(lang, "pagesDone", { n: run.result.pages })}</span>}
              </div>
              <p className="text-xs text-(--muted-fg)">{toc(lang, "added", { name: run.name })}</p>
            </>
          )}
          {run.result.details.some((page) => page.straightened !== 0 || page.columns > 1) && (
            <p className="text-xs text-(--muted-fg)">
              {toc(lang, "notes", { straight: run.result.details.filter((page) => page.straightened !== 0).length, columns: run.result.details.filter((page) => page.columns > 1).length })}
            </p>
          )}
          {run.result.details.some((page) => page.words.length > 0) && <OcrWords lang={lang} details={run.result.details} />}
        </section>
      )}

      <p className="text-xs text-(--muted-fg)">{toc(lang, "limits")}</p>
    </div>
  );
}
