/**
 * The image operation family, extracted from the old Image tool page.
 *
 * One `ImageOperation` covers both tasks the capability registry exposes
 * (`image.convert` / `image.transform` / `image.strip`): it seeds its item list
 * from the image assets the workbench hands it and hides its own file picker,
 * or behaves exactly like the legacy `/image` page when rendered standalone.
 */

import * as React from "react";
import { Download, MapPin, Trash2, X } from "lucide-react";
import { zipSync } from "fflate";

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
import { readJpegMetadata, readPngMetadata, type ImageMetadata } from "@/lib/image/exif";
import { ti } from "@/lib/image/i18n";
import { MIME_BY_FORMAT, savedPercent, uniqueNames, type OutputFormat, type ResizeMode } from "@/lib/image/plan";
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
import type { OperationProps } from "@/lib/workbench/operation";
import { useSeedAssets } from "@/lib/workbench/use-seed-assets";
import { formatBytes } from "@/lib/viewer/utils";
import { cn } from "@/lib/viewer/utils";

const STORAGE_KEY = "lab:image:v1";

type Found = { label: string; value: string; warn?: boolean }[];

interface Item {
  id: number;
  file: File;
  status: "working" | "done" | "error";
  /** Stable identity for output dedupe across re-seeds (asset id or file fingerprint). */
  sourceKey: string;
  /** Settings the current result was made with. */
  doneKey?: string;
  result?: ProcessedImage;
  url?: string;
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

export function ImageOperation({
  lang,
  assets,
  params,
  setParams,
  onProduce,
  defaultTask,
}: OperationProps & { defaultTask?: ImageTask }) {
  const [settings, setSettings] = React.useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  const [hydrated, setHydrated] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const [avifOk, setAvifOk] = React.useState(false);
  const idRef = React.useRef(0);
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const standalone = assets.length === 0;
  // Keep the latest props for the process effect without restarting it.
  const onProduceRef = React.useRef(onProduce);
  onProduceRef.current = onProduce;
  const producedRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const stored = loadSettings();
    const requested = params?.task;
    const task: ImageTask = requested === "strip" || requested === "convert" ? requested : defaultTask ?? stored.task;
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

  const patch = React.useCallback((id: number, changes: Partial<Item>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        if (changes.url !== undefined && item.url) URL.revokeObjectURL(item.url);
        return { ...item, ...changes };
      }),
    );
  }, []);

  // (Re)process everything whose result does not match the current settings.
  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const effective = JSON.parse(debouncedKey) as ImageSettings;
    (async () => {
      for (const item of itemsRef.current) {
        if (cancelled) return;
        if (item.doneKey === debouncedKey) continue;
        patch(item.id, { status: "working" });
        try {
          const result = await processImage(item.file, effective);
          if (cancelled) return;
          patch(item.id, { status: "done", result, url: URL.createObjectURL(result.blob), doneKey: debouncedKey, error: undefined });
          const produceKey = `${item.sourceKey}:${debouncedKey}`;
          if (onProduceRef.current && !producedRef.current.has(produceKey)) {
            producedRef.current.add(produceKey);
            try {
              const bytes = new Uint8Array(await result.blob.arrayBuffer());
              if (!cancelled) onProduceRef.current({ name: result.name, type: result.mime, bytes, kind: "image" });
            } catch {
              // Publishing an output is best-effort.
            }
          }
        } catch (error) {
          if (cancelled) return;
          patch(item.id, { status: "error", doneKey: debouncedKey, error: error instanceof ImageError ? error.code : "decode" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedKey, itemSignature, hydrated, patch]);

  React.useEffect(
    () => () => {
      for (const item of itemsRef.current) if (item.url) URL.revokeObjectURL(item.url);
    },
    [],
  );

  const addFiles = React.useCallback(
    (files: File[], sourceKeys?: readonly string[]) => {
      const fresh: Item[] = [];
      files.forEach((file, index) => {
        if (!(file.type.startsWith("image/") || /\.(png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(file.name))) return;
        fresh.push({
          id: (idRef.current += 1),
          file,
          status: "working",
          inspected: false,
          sourceKey: sourceKeys?.[index] ?? `${file.name}:${file.size}`,
        });
      });
      if (fresh.length === 0) return;
      setItems((current) => [...current, ...fresh]);
      for (const item of fresh) {
        void inspect(lang, item.file).then((found) => patch(item.id, { found, inspected: true }));
      }
    },
    [lang, patch],
  );

  // Auto-add the image assets supplied by the workbench (no picker in that mode).
  useSeedAssets(assets, async (list) => {
    const files: File[] = [];
    const keys: string[] = [];
    for (const asset of list) {
      if (asset.kind !== "image") continue;
      try {
        const bytes = await asset.bytes();
        const type = asset.source.type || IMAGE_MIME_BY_EXTENSION[asset.extension] || "application/octet-stream";
        files.push(new File([bytes as unknown as BlobPart], asset.name, { type }));
        keys.push(asset.id);
      } catch {
        // A file we cannot read simply never reaches the list.
      }
    }
    if (files.length > 0) addFiles(files, keys);
  });

  React.useEffect(() => {
    // The workbench shell owns paste while it supplies assets; attaching here
    // too would add the same clipboard image twice.
    if (!standalone) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (files.length > 0) {
        event.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, standalone]);

  const remove = (id: number) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const clearAll = () => {
    for (const item of itemsRef.current) if (item.url) URL.revokeObjectURL(item.url);
    setItems([]);
  };

  const downloadAll = async () => {
    const done = items.filter((item) => item.result);
    const names = uniqueNames(done.map((item) => item.result!.name));
    const files: Record<string, Uint8Array> = {};
    for (const [index, item] of done.entries()) files[names[index]!] = new Uint8Array(await item.result!.blob.arrayBuffer());
    // Images are already compressed; storing them keeps the zip fast.
    saveBlob(new Blob([zipSync(files, { level: 0 }) as unknown as BlobPart], { type: "application/zip" }), "images.zip");
  };

  const update = (changes: Partial<ImageSettings>) => {
    setSettings((current) => ({ ...current, ...changes }));
    if (changes.task) setParams?.({ task: changes.task });
  };
  const updateResize = (changes: Partial<ImageSettings["resize"]>) => setSettings((current) => ({ ...current, resize: { ...current.resize, ...changes } }));
  const convert = settings.task === "convert";
  const losslessFormat = settings.format === "png";
  const doneCount = items.filter((item) => item.result).length;

  const numberOrNull = (value: string) => (value === "" ? null : Math.max(1, Math.floor(Number(value)) || 1));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        {standalone && (
          <FilePicker lang={lang} accept="image/*,.svg,.avif,.webp" multiple prompt={ti(lang, "pick")} hint={ti(lang, "pickHint")} onFiles={addFiles} compact />
        )}

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
            {ti(lang, "results")} {items.length > 0 && <span className="font-normal text-(--muted-fg)">({items.length})</span>}
          </h2>
          {items.length > 0 && (
            <div className="flex gap-2">
              {doneCount > 1 && (
                <ActionButton className="h-8 px-3 text-xs" onClick={() => void downloadAll()}>
                  <Download aria-hidden="true" className="size-3.5" />
                  {ti(lang, "downloadAll")}
                </ActionButton>
              )}
              <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={clearAll}>
                <Trash2 aria-hidden="true" className="size-3.5" />
                {ti(lang, "clearAll")}
              </ActionButton>
            </div>
          )}
        </div>

        <ul className="flex flex-col gap-3" aria-live="polite">
          {items.map((item) => (
            <ResultCard key={item.id} lang={lang} item={item} onRemove={() => remove(item.id)} />
          ))}
        </ul>
      </section>
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

function ResultCard({ lang, item, onRemove }: { lang: AppLang; item: Item; onRemove: () => void }) {
  const { result } = item;
  const percent = result ? savedPercent(item.file.size, result.blob.size) : 0;

  return (
    <li className={cn(panelClass, "flex flex-col gap-3")}>
      <div className="flex gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-(--border) bg-(--bg)">
          {item.url ? <img src={item.url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-(--muted-fg)">…</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-medium" title={result?.name ?? item.file.name}>
            {result?.name ?? item.file.name}
          </p>
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
                <span className="text-(--muted-fg)">{formatBytes(item.file.size)}</span> → <strong>{formatBytes(result.blob.size)}</strong>{" "}
                <span className={cn("text-xs", percent > 0 ? "text-(--success)" : percent < 0 ? "text-(--warning)" : "text-(--muted-fg)")}>
                  {percent > 0 ? ti(lang, "smaller", { percent }) : percent < 0 ? ti(lang, "larger", { percent: -percent }) : ti(lang, "sameSize")}
                </span>
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
          <button
            type="button"
            onClick={onRemove}
            aria-label={ti(lang, "remove", { name: item.file.name })}
            className="inline-flex size-7 items-center justify-center rounded-md text-(--muted-fg) hover:bg-(--bg) hover:text-(--fg)"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
          {result && item.url && (
            <a
              href={item.url}
              download={result.name}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-(--accent) px-3 text-xs font-medium text-(--accent-fg) no-underline hover:bg-(--accent)/90"
            >
              <Download aria-hidden="true" className="size-3.5" />
              {ti(lang, "download")}
              <span className="sr-only"> {result.name}</span>
            </a>
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
}

function useDebouncedString(value: string, delay: number): string {
  const [state, setState] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setState(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return state;
}
