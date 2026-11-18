/**
 * `image.edit` — convert, resize and compress images, or strip their
 * metadata. It works on every image open in the workbench at once (a batch
 * downloads as a zip).
 *
 * Built so a thousand photos stay usable:
 * - Files are never copied into memory: each is read only while it is being
 *   processed, a few at a time, and only the (smaller) result is kept.
 * - From `BATCH_MIN` images on, nothing starts by itself: a setting changed with
 *   a slider would otherwise restart the whole batch. Processing runs on request,
 *   with progress, and can be stopped and continued.
 * - The list is held outside React state and published a few times a second, and
 *   only a page of rows is on screen at a time, with thumbnails decoded small and
 *   only when visible.
 * - "Download all" streams a zip file by file instead of building it in memory.
 */

import * as React from "react";
import { Download, MapPin } from "lucide-react";

import { BlobThumb } from "@/components/workbench/BlobThumb";
import { ShowMore } from "@/components/workbench/ShowMore";
import {
  ActionButton,
  SelectField,
  inputClass,
  labelClass,
  panelClass,
} from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { readJpegMetadata, readPngMetadata, type ImageMetadata } from "@/lib/image/exif";
import { ti } from "@/lib/image/i18n";
import { MIME_BY_FORMAT, savedPercent, type OutputFormat, type ResizeMode } from "@/lib/image/plan";
import {
  DEFAULT_IMAGE_SETTINGS,
  ImageError,
  processImage,
  sniffImageMime,
  supportedOutputMimes,
  type ImageSettings,
  type ImageTask,
  type ProcessNote,
  type ProcessedImage,
} from "@/lib/image/process";
import { PAGE_SIZE, imagesLabel, isBatch } from "@/lib/workbench/batch";
import { useItemStore } from "@/lib/workbench/item-store";
import type { OperationProps } from "@/lib/workbench/operation";
import { createLimiter, defaultConcurrency, runPool } from "@/lib/workbench/pool";
import { useSeedAssets } from "@/lib/workbench/use-seed-assets";
import { archiveNames, zipBlobs } from "@/lib/workbench/zip";
import { cn, formatBytes } from "@/lib/viewer/utils";

const STORAGE_KEY = "lab:image:v1";

type Found = { label: string; value: string; warn?: boolean }[];

interface Item {
  id: number;
  /** A handle on the original; its bytes are only read while it is processed. */
  file: File;
  /** `idle` until a run picks it up, `waiting` while it is queued in a run. */
  status: "idle" | "waiting" | "working" | "done" | "error";
  /** Settings the current result (or failure) was made with. */
  doneKey?: string;
  result?: ProcessedImage;
  error?: string;
  found?: Found;
  /** True once the original's metadata has been inspected. */
  inspected: boolean;
}

/** Best-effort input MIME for an image asset (its source may have no type). */
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

/** Metadata is read for a couple of files at a time, as their rows come into view. */
const inspectLimit = createLimiter(2);

function describeMetadata(lang: AppLang, meta: ImageMetadata): Found {
  const found: Found = [];
  const camera = [meta.make, meta.model].filter(Boolean).join(" ");
  if (camera) found.push({ label: ti(lang, "metaCamera"), value: camera });
  if (meta.lens) found.push({ label: ti(lang, "metaLens"), value: meta.lens });
  if (meta.software) found.push({ label: ti(lang, "metaSoftware"), value: meta.software });
  if (meta.dateTime) found.push({ label: ti(lang, "metaDate"), value: meta.dateTime });
  if (meta.gps) {
    found.push({
      label: ti(lang, "metaGps"),
      value: `${meta.gps.latitude.toFixed(5)}, ${meta.gps.longitude.toFixed(5)} — ${ti(lang, "metaGpsWarn")}`,
      warn: true,
    });
  }
  if (meta.orientation && meta.orientation !== 1) found.push({ label: ti(lang, "metaOrientation"), value: String(meta.orientation) });
  if (meta.hasExif && found.length === 0) found.push({ label: ti(lang, "metaExif"), value: "✓" });
  if (meta.hasXmp) found.push({ label: ti(lang, "metaXmp"), value: "✓" });
  if (meta.hasIptc) found.push({ label: ti(lang, "metaIptc"), value: "✓" });
  if (meta.hasIcc) found.push({ label: ti(lang, "metaIcc"), value: "✓" });
  return found;
}

async function inspect(lang: AppLang, file: File): Promise<Found> {
  try {
    if (file.size > 64 * 1024 * 1024) return [];
    const head = new Uint8Array(await file.slice(0, 20 * 1024 * 1024).arrayBuffer());
    const mime = sniffImageMime(head, file.type);
    if (mime === "image/jpeg") return describeMetadata(lang, readJpegMetadata(head));
    if (mime === "image/png") {
      const png = readPngMetadata(head);
      if (!png) return [];
      const found: Found = [];
      if (png.hasText) found.push({ label: ti(lang, "metaText"), value: "✓" });
      if (png.hasExif) found.push({ label: ti(lang, "metaExif"), value: "✓" });
      if (png.hasTime) found.push({ label: ti(lang, "metaTime"), value: "✓" });
      if (png.hasIcc) found.push({ label: ti(lang, "metaIcc"), value: "✓" });
      return found;
    }
  } catch {
    // Metadata display is a convenience; ignore failures.
  }
  return [];
}

function loadSettings(): ImageSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { settings?: Partial<ImageSettings> } | null;
    const saved = raw?.settings;
    if (!saved) return DEFAULT_IMAGE_SETTINGS;
    return {
      task: saved.task === "strip" ? "strip" : "convert",
      format: (["keep", "jpeg", "png", "webp", "avif"] as const).includes(saved.format as OutputFormat) ? (saved.format as OutputFormat) : "keep",
      quality: Math.min(1, Math.max(0.1, Number(saved.quality) || DEFAULT_IMAGE_SETTINGS.quality)),
      resize: {
        mode: (["none", "fit", "percent"] as const).includes(saved.resize?.mode as ResizeMode) ? (saved.resize!.mode as ResizeMode) : "none",
        maxWidth: Number(saved.resize?.maxWidth) > 0 ? Number(saved.resize!.maxWidth) : null,
        maxHeight: Number(saved.resize?.maxHeight) > 0 ? Number(saved.resize!.maxHeight) : null,
        percent: Math.min(400, Math.max(1, Number(saved.resize?.percent) || 50)),
        allowUpscale: Boolean(saved.resize?.allowUpscale),
      },
      background: /^#[0-9a-f]{6}$/i.test(saved.background ?? "") ? saved.background! : "#ffffff",
    };
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}

export function ImageOperation({ lang, assets, params, setParams }: OperationProps) {
  const [settings, setSettings] = React.useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  const [hydrated, setHydrated] = React.useState(false);
  const [avifOk, setAvifOk] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [packing, setPacking] = React.useState<{ done: number; total: number } | null>(null);
  const [shown, setShown] = React.useState(PAGE_SIZE);

  const store = useItemStore<Item>();
  const storeRef = React.useRef(store);
  storeRef.current = store;
  const items = store.items;
  const idRef = React.useRef(0);
  // Bumped to retire every run still in flight (new settings, new files, unmount).
  const generation = React.useRef(0);
  const stopRequested = React.useRef(false);
  const inspecting = React.useRef(new Set<number>());

  React.useEffect(() => {
    const stored = loadSettings();
    const requested = params?.task;
    const task: ImageTask = requested === "strip" || requested === "convert" ? requested : stored.task;
    setSettings({ ...stored, task });
    setAvifOk(supportedOutputMimes().has(MIME_BY_FORMAT.avif));
    setHydrated(true);
    // The initial task is a mount-time decision; later changes flow through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings }));
    } catch {
      // Preferences are optional.
    }
  }, [settings, hydrated]);

  const settingsKey = JSON.stringify(settings);
  const debouncedKey = useDebouncedString(settingsKey, 250);
  const itemSignature = items.map((item) => item.id).join(",");
  const batch = isBatch(items.length);

  /** Process every item that has no result for `key` yet, a few at a time. */
  const run = React.useCallback(async (key: string, retryFailed: boolean) => {
    generation.current += 1;
    const mine = generation.current;
    stopRequested.current = false;
    const effective = JSON.parse(key) as ImageSettings;
    const todo = storeRef.current
      .all()
      .filter((item) => item.doneKey !== key || (retryFailed && item.status === "error"))
      .map((item) => item.id);
    if (todo.length === 0) return;
    storeRef.current.updateMany(todo, { status: "waiting" });
    setRunning(true);
    await runPool(
      todo,
      defaultConcurrency(),
      async (id) => {
        const item = storeRef.current.get(id);
        if (!item || mine !== generation.current) return;
        storeRef.current.update(id, { status: "working" });
        try {
          const result = await processImage(item.file, effective);
          // A run that was replaced (new settings, new files) must not write over its successor.
          if (mine !== generation.current) return;
          storeRef.current.update(id, { status: "done", result, doneKey: key, error: undefined });
        } catch (error) {
          if (mine !== generation.current) return;
          storeRef.current.update(id, { status: "error", doneKey: key, error: error instanceof ImageError ? error.code : "decode" });
        }
      },
      () => stopRequested.current || mine !== generation.current,
    );
    if (mine === generation.current) {
      // Whatever a stop left unstarted goes back to waiting for the next run.
      setRunning(false);
    }
  }, []);

  // Small sets follow the settings live; a batch waits for the button.
  React.useEffect(() => {
    if (!hydrated || batch || items.length === 0) return;
    void run(debouncedKey, false);
    return () => {
      generation.current += 1;
    };
    // `items` is read through the store; its ids are what should restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, itemSignature, hydrated, batch, run]);

  React.useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  // Take the image assets supplied by the workbench. Nothing is read here: an
  // item only holds the file, and its bytes are read when it is processed.
  useSeedAssets(assets, async (list, isCancelled) => {
    const fresh: Item[] = [];
    for (const asset of list) {
      if (asset.kind !== "image") continue;
      try {
        const blob = await asset.toBlob();
        const type = asset.source.type || IMAGE_MIME_BY_EXTENSION[asset.extension] || "";
        // A File over a Blob is a reference, not a copy.
        fresh.push({
          id: (idRef.current += 1),
          file: new File([blob], asset.name, { type, lastModified: asset.source.lastModified }),
          status: "idle",
          inspected: false,
        });
      } catch {
        // A file we cannot read simply never reaches the list.
      }
    }
    if (isCancelled()) return;
    storeRef.current.reset(fresh);
  });

  /** Read a row's metadata the first time it is shown. */
  const inspectItem = React.useCallback(
    (id: number) => {
      const item = storeRef.current.get(id);
      if (!item || item.inspected || inspecting.current.has(id)) return;
      inspecting.current.add(id);
      void inspectLimit(() => inspect(lang, item.file)).then((found) => storeRef.current.update(id, { found, inspected: true }));
    },
    [lang],
  );

  const counts = React.useMemo(() => {
    let fresh = 0;
    let failed = 0;
    let stale = 0;
    let remaining = 0;
    let from = 0;
    let to = 0;
    let bytes = 0;
    for (const item of items) {
      bytes += item.file.size;
      const current = item.doneKey === settingsKey;
      if (item.result && current) {
        fresh += 1;
        from += item.file.size;
        to += item.result.blob.size;
      } else if (item.result) stale += 1;
      if (item.status === "error" && current) failed += 1;
      if (!current || item.status === "error") remaining += 1;
    }
    return { fresh, failed, stale, remaining, from, to, bytes };
  }, [items, settingsKey]);

  const downloadable = React.useMemo(
    () => items.filter((item) => item.result && (!batch || item.doneKey === settingsKey)),
    [items, batch, settingsKey],
  );

  const downloadAll = async () => {
    setPacking({ done: 0, total: downloadable.length });
    try {
      const archives = await zipBlobs(
        downloadable.map((item) => ({ name: item.result!.name, blob: item.result!.blob })),
        { onProgress: (done, total) => setPacking({ done, total }) },
      );
      const names = archiveNames("images", archives.length);
      // Browsers swallow downloads fired together; space them out.
      archives.forEach((blob, index) => window.setTimeout(() => saveBlob(blob, names[index]!), index * 400));
    } finally {
      setPacking(null);
    }
  };

  const update = (changes: Partial<ImageSettings>) => {
    setSettings((current) => ({ ...current, ...changes }));
    if (changes.task) setParams?.({ task: changes.task });
  };
  const updateResize = (changes: Partial<ImageSettings["resize"]>) => setSettings((current) => ({ ...current, resize: { ...current.resize, ...changes } }));
  const convert = settings.task === "convert";
  const losslessFormat = settings.format === "png";

  const numberOrNull = (value: string) => (value === "" ? null : Math.max(1, Math.floor(Number(value)) || 1));
  const showMore = React.useCallback(() => setShown((current) => current + PAGE_SIZE), []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <fieldset className={cn(panelClass, "flex flex-col gap-3")}>
          <legend className="px-1 text-sm font-semibold">{ti(lang, "task")}</legend>
          <div role="radiogroup" aria-label={ti(lang, "task")} className="flex flex-col gap-1.5">
            {(["convert", "strip"] as const).map((task) => (
              <label key={task} className="flex items-start gap-2 text-sm">
                <input type="radio" name="image-task" className="mt-1" checked={settings.task === task} onChange={() => update({ task })} />
                <span>{ti(lang, task === "convert" ? "taskConvert" : "taskStrip")}</span>
              </label>
            ))}
          </div>

          {!convert && <p className="text-xs text-(--muted-fg)">{ti(lang, "stripHint")}</p>}

          {convert && (
            <>
              <SelectField
                label={ti(lang, "format")}
                value={settings.format}
                onChange={(value) => update({ format: value as OutputFormat })}
                options={[
                  { value: "keep", label: ti(lang, "formatKeep") },
                  { value: "jpeg", label: "JPEG" },
                  { value: "png", label: "PNG" },
                  { value: "webp", label: "WebP" },
                  ...(avifOk ? [{ value: "avif", label: "AVIF" }] : []),
                ]}
              />
              <label className={labelClass}>
                {ti(lang, "quality", { quality: Math.round(settings.quality * 100) })}
                <input type="range" min={10} max={100} step={1} value={Math.round(settings.quality * 100)} disabled={losslessFormat} onChange={(event) => update({ quality: Number(event.target.value) / 100 })} aria-describedby={losslessFormat ? "image-quality-note" : undefined} />
              </label>
              {losslessFormat && (
                <p id="image-quality-note" className="text-xs text-(--muted-fg)">
                  {ti(lang, "qualityPng")}
                </p>
              )}

              <SelectField
                label={ti(lang, "resize")}
                value={settings.resize.mode}
                onChange={(value) => updateResize({ mode: value as ResizeMode })}
                options={[
                  { value: "none", label: ti(lang, "resizeNone") },
                  { value: "fit", label: ti(lang, "resizeFit") },
                  { value: "percent", label: ti(lang, "resizePercent") },
                ]}
              />
              {settings.resize.mode === "fit" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>
                    {ti(lang, "maxWidth")}
                    <input type="number" min={1} className={inputClass} value={settings.resize.maxWidth ?? ""} onChange={(event) => updateResize({ maxWidth: numberOrNull(event.target.value) })} />
                  </label>
                  <label className={labelClass}>
                    {ti(lang, "maxHeight")}
                    <input type="number" min={1} className={inputClass} value={settings.resize.maxHeight ?? ""} onChange={(event) => updateResize({ maxHeight: numberOrNull(event.target.value) })} />
                  </label>
                </div>
              )}
              {settings.resize.mode === "percent" && (
                <label className={labelClass}>
                  {ti(lang, "percent", { percent: settings.resize.percent })}
                  <input type="range" min={1} max={200} value={Math.min(200, settings.resize.percent)} onChange={(event) => updateResize({ percent: Number(event.target.value) })} />
                </label>
              )}
              {settings.resize.mode !== "none" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={settings.resize.allowUpscale} onChange={(event) => updateResize({ allowUpscale: event.target.checked })} />
                  {ti(lang, "upscale")}
                </label>
              )}
              {(settings.format === "jpeg" || settings.format === "keep") && (
                <label className={labelClass}>
                  {ti(lang, "background")}
                  <input type="color" value={settings.background} onChange={(event) => update({ background: event.target.value })} className="h-9 w-16 cursor-pointer rounded border border-(--border) bg-transparent p-0.5" />
                </label>
              )}
            </>
          )}
          <p className="text-xs text-(--muted-fg)">{ti(lang, "metadataNote")}</p>
        </fieldset>
      </div>

      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="image-results">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="image-results" className="text-sm font-semibold">
            {ti(lang, "results")} {items.length > 0 && <span className="font-normal text-(--muted-fg)">({items.length.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")})</span>}
          </h2>
          {downloadable.length > 1 && !(batch && running) && (
            <ActionButton className="h-8 px-3 text-xs" disabled={packing !== null} onClick={() => void downloadAll()}>
              <Download aria-hidden="true" className="size-3.5" />
              {packing ? ti(lang, "packing", { done: packing.done, total: packing.total }) : ti(lang, "downloadAll")}
            </ActionButton>
          )}
        </div>

        {batch && (
          <BatchBar
            lang={lang}
            running={running}
            counts={counts}
            total={items.length}
            onProcess={() => void run(settingsKey, true)}
            onStop={() => {
              stopRequested.current = true;
              setRunning(false);
            }}
          />
        )}

        <ul className="flex flex-col gap-3" aria-live={batch ? "off" : "polite"}>
          {items.slice(0, shown).map((item) => (
            <ResultRow key={item.id} lang={lang} item={item} stale={batch && item.result !== undefined && item.doneKey !== settingsKey} onInspect={inspectItem} />
          ))}
        </ul>
        {items.length > shown && <ShowMore label={ti(lang, "showMore", { n: Math.min(PAGE_SIZE, items.length - shown), left: items.length - shown })} onMore={showMore} />}
      </section>
    </div>
  );
}

interface Counts {
  fresh: number;
  failed: number;
  stale: number;
  remaining: number;
  from: number;
  to: number;
  bytes: number;
}

/** The control strip of a batch: what is queued, how far it has got, and the button to run it. */
function BatchBar({
  lang,
  running,
  counts,
  total,
  onProcess,
  onStop,
}: {
  lang: AppLang;
  running: boolean;
  counts: Counts;
  total: number;
  onProcess: () => void;
  onStop: () => void;
}) {
  const percent = savedPercent(counts.from, counts.to);
  const label = counts.fresh > 0 ? "applyRest" : "applyBatch";
  return (
    <div className={cn(panelClass, "flex flex-col gap-3")} data-batch-bar="">
      {counts.fresh === 0 && !running && (
        <>
          <p className="text-sm font-medium">{ti(lang, "batchReady", { count: imagesLabel(lang, total), size: formatBytes(counts.bytes) })}</p>
          <p className="text-xs text-(--muted-fg)">{ti(lang, counts.stale > 0 ? "batchStale" : "batchHint")}</p>
        </>
      )}
      {(counts.fresh > 0 || running) && (
        <div className="flex flex-col gap-1.5">
          <p role="status" className="text-sm font-medium">
            {running ? ti(lang, "batchProgress", { done: counts.fresh + counts.failed, total }) : ti(lang, "batchDone", { done: counts.fresh, total })}
          </p>
          <progress className="w-full" value={counts.fresh + counts.failed} max={total} aria-label={ti(lang, "batchProgress", { done: counts.fresh + counts.failed, total })} />
          {counts.fresh > 0 && (
            <p className="text-xs text-(--muted-fg)">
              {ti(lang, "batchSizes", { from: formatBytes(counts.from), to: formatBytes(counts.to) })}{" "}
              {percent > 0 ? `· ${ti(lang, "smaller", { percent })}` : percent < 0 ? `· ${ti(lang, "larger", { percent: -percent })}` : ""}
            </p>
          )}
          {counts.failed > 0 && !running && (
            <p role="alert" className="text-xs text-(--warning)">
              {ti(lang, "batchFailed", { n: counts.failed })}
            </p>
          )}
          {counts.stale > 0 && !running && <p className="text-xs text-(--muted-fg)">{ti(lang, "batchStale")}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <ActionButton variant="secondary" onClick={onStop}>
            {ti(lang, "stop")}
          </ActionButton>
        ) : (
          counts.remaining > 0 && (
            <ActionButton onClick={onProcess}>{ti(lang, label, { count: imagesLabel(lang, counts.remaining) })}</ActionButton>
          )
        )}
      </div>
    </div>
  );
}

const NOTE_KEYS: Record<ProcessNote, "noteAlreadySmall" | "noteAnimatedGif" | "noteLossless" | "noteFallbackType"> = {
  alreadySmall: "noteAlreadySmall",
  animatedGif: "noteAnimatedGif",
  lossless: "noteLossless",
  fallbackType: "noteFallbackType",
};

const ERROR_KEYS = { fileTooLarge: "errFileTooLarge", tooManyPixels: "errTooManyPixels", decode: "errDecode", encode: "errEncode" } as const;

const ResultRow = React.memo(function ResultRow({
  lang,
  item,
  stale,
  onInspect,
}: {
  lang: AppLang;
  item: Item;
  stale: boolean;
  onInspect: (id: number) => void;
}) {
  const { result } = item;
  const percent = result ? savedPercent(item.file.size, result.blob.size) : 0;
  // Metadata is read when the row first appears, not for the whole batch up front.
  React.useEffect(() => onInspect(item.id), [item.id, onInspect]);

  return (
    <li className={cn(panelClass, "flex flex-col gap-3", stale && "opacity-60")}>
      <div className="flex gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-(--border) bg-(--bg)">
          <BlobThumb blob={result?.blob ?? item.file} px={80} fit="contain" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-medium" title={result?.name ?? item.file.name}>
            {result?.name ?? item.file.name}
          </p>
          {item.status === "idle" && !result && <p className="text-sm text-(--muted-fg)">{formatBytes(item.file.size)}</p>}
          {item.status === "waiting" && <p className="text-sm text-(--muted-fg)">{ti(lang, "waiting")}</p>}
          {item.status === "working" && (
            <p role="status" className="text-sm text-(--muted-fg)">
              {ti(lang, "working")}
            </p>
          )}
          {item.status === "error" && (
            <p role="alert" className="text-sm text-(--warning)">
              {ti(lang, ERROR_KEYS[(item.error as keyof typeof ERROR_KEYS) ?? "decode"] ?? "errDecode")}
            </p>
          )}
          {result && (
            <>
              <p className="text-sm">
                <span className="whitespace-nowrap text-(--muted-fg)">{formatBytes(item.file.size)}</span> → <strong className="whitespace-nowrap">{formatBytes(result.blob.size)}</strong>{" "}
                <span className={cn("text-xs", percent > 0 ? "text-(--success)" : percent < 0 ? "text-(--warning)" : "text-(--muted-fg)")}>
                  {percent > 0 ? ti(lang, "smaller", { percent }) : percent < 0 ? ti(lang, "larger", { percent: -percent }) : ti(lang, "sameSize")}
                </span>
                {stale && <span className="ml-2 text-xs text-(--muted-fg)">{ti(lang, "outdated")}</span>}
              </p>
              {result.width > 0 && <p className="text-xs text-(--muted-fg)">{ti(lang, "dims", { width: result.width, height: result.height })}</p>}
              {result.notes.map((note) => (
                <p key={note} className="text-xs text-(--muted-fg)">
                  {ti(lang, NOTE_KEYS[note])}
                </p>
              ))}
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {result && (
            <button
              type="button"
              onClick={() => saveBlob(result.blob, result.name)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-(--accent) px-3 text-xs font-medium text-(--accent-fg) hover:bg-(--accent)/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              <Download aria-hidden="true" className="size-3.5" />
              {ti(lang, "download")}
              <span className="sr-only"> {result.name}</span>
            </button>
          )}
        </div>
      </div>

      {item.inspected && (
        <details className="text-sm">
          <summary className="cursor-pointer text-(--muted-fg)">
            {item.found && item.found.length > 0 ? ti(lang, "metaFound") : ti(lang, "metaNone")}
            {item.found?.some((entry) => entry.warn) && <MapPin aria-hidden="true" className="ml-1.5 inline size-3.5 text-(--warning)" />}
          </summary>
          {item.found && item.found.length > 0 && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {item.found.map((entry) => (
                <React.Fragment key={entry.label}>
                  <dt className="text-(--muted-fg)">{entry.label}</dt>
                  <dd className={cn("break-words", entry.warn && "font-medium text-(--warning)")}>{entry.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
        </details>
      )}
    </li>
  );
});

function useDebouncedString(value: string, delay: number): string {
  const [state, setState] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setState(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return state;
}
