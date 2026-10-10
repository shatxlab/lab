/**
 * The workbench shell — Phase 2 of the intent-driven workbench.
 *
 * The inverse of the old tool pages: an asset is the destination and every
 * capability that applies to the current selection becomes an action. The
 * shell owns the selection, the active operation, its persisted parameters and
 * the produced outputs; operations stay stateless with respect to the shell
 * and publish results through `onProduce`.
 *
 * This file is the single owner of state: the named sub-components below are
 * pure presentational pieces exported so they can be unit-tested in isolation.
 *
 * SSR note: nothing here touches `window`/`document` at module scope — the
 * paste listener and the lazy operation loader only run inside effects.
 */

import * as React from "react";
import { Download, X } from "lucide-react";

import { ActionButton, FilePicker, ToolPage, panelClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { useAppLang } from "@/lib/apps/use-app-lang";
import {
  CAPABILITY_GROUPS,
  PRIMARY_COUNT,
  capabilityById,
  capabilitiesFor,
  type CapabilityGroup,
  type CapabilityId,
  type CapabilityMatch,
  type CapabilitySet,
} from "@/lib/workbench/capabilities";
import { createAssetFromBytes, createAssetFromFile, createAssetFromText, type Asset } from "@/lib/workbench/asset";
import { wb, type WorkbenchKey } from "@/lib/workbench/i18n";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import type { OperationComponent, OperationOutput, OperationProps } from "@/lib/workbench/operation";
import { cn, formatBytes } from "@/lib/viewer/utils";

/** Test seam: pre-resolved operation components keyed by capability. */
export type OperationRegistry = Partial<Record<CapabilityId, OperationComponent>>;

/** i18n key for each capability group heading. */
const GROUP_KEY: Record<CapabilityGroup, WorkbenchKey> = {
  view: "groupView",
  edit: "groupEdit",
  convert: "groupConvert",
  transform: "groupTransform",
  analyze: "groupAnalyze",
  secure: "groupSecure",
  create: "groupCreate",
  share: "groupShare",
};

function capabilityLabel(lang: AppLang, id: CapabilityId): string {
  return capabilityById(id)?.label[lang] ?? id;
}

/* --------------------------------------------------------------- input bar */

export interface InputBarProps {
  lang: AppLang;
  onFiles: (files: File[]) => void;
  onText: (text: string) => void;
  /** Compact drop zone once assets are already open. */
  compact?: boolean;
}

/**
 * The acquisition strip: a multi-file picker plus a global paste handler.
 * Pasted files win over pasted text, and paste is ignored while the user is
 * typing into a field so pasting into an operation never re-adds the draft.
 */
export function InputBar({ lang, onFiles, onText, compact = false }: InputBarProps) {
  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        onFiles(files);
        return;
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (text !== "") {
        event.preventDefault();
        onText(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles, onText]);

  return (
    <FilePicker
      lang={lang}
      accept="*/*"
      multiple
      compact={compact}
      prompt={wb(lang, "inputPrompt")}
      hint={wb(lang, "inputHint")}
      onFiles={onFiles}
    />
  );
}

/* -------------------------------------------------------------- asset tray */

export interface AssetTrayProps {
  lang: AppLang;
  assets: readonly Asset[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function AssetTray({ lang, assets, onRemove, onClear }: AssetTrayProps) {
  return (
    <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="wb-assets">
      <div className="flex items-center justify-between gap-2">
        <h2 id="wb-assets" className="text-sm font-semibold">
          {wb(lang, "assets")}
        </h2>
        <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={onClear}>
          {wb(lang, "clear")}
        </ActionButton>
      </div>
      <ul className="flex flex-col gap-2">
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-center gap-3 rounded-lg border border-(--border) bg-(--bg) px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium" title={asset.name}>
                {asset.name}
              </span>
              <span className="text-xs text-(--muted-fg)">
                {asset.kind} · {formatBytes(asset.size)}
              </span>
            </div>
            <button
              type="button"
              aria-label={wb(lang, "remove", { name: asset.name })}
              onClick={() => onRemove(asset.id)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-(--muted-fg) transition-colors hover:bg-(--surface) hover:text-(--fg) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------- suggested next */

export interface SuggestedNextProps {
  lang: AppLang;
  items: readonly CapabilityMatch[];
  onSelect: (id: CapabilityId) => void;
}

export function SuggestedNext({ lang, items, onSelect }: SuggestedNextProps) {
  if (items.length === 0) return null;
  return (
    <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="wb-suggested">
      <h2 id="wb-suggested" className="text-sm font-semibold">
        {wb(lang, "suggested")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((entry) => (
          <ActionButton key={entry.capability.id} onClick={() => onSelect(entry.capability.id)}>
            {capabilityLabel(lang, entry.capability.id)}
          </ActionButton>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- action rail */

export interface ActionRailProps {
  lang: AppLang;
  set: CapabilitySet;
  /** Whether a component exists for the capability (registry or injected). */
  isRenderable: (id: CapabilityId) => boolean;
  activeId: CapabilityId | null;
  onSelect: (id: CapabilityId) => void;
}

/**
 * The grouped "everything that could apply" rail. Enabled-but-unregistered
 * capabilities stay visible but disabled (they are coming), and capabilities
 * that do not match the selection are shown disabled with their reason, so the
 * rail doubles as an explanation of what the selection unlocks.
 */
export function ActionRail({ lang, set, isRenderable, activeId, onSelect }: ActionRailProps) {
  const enabledByGroup = new Map<CapabilityGroup, CapabilityMatch[]>();
  for (const group of set.byGroup) enabledByGroup.set(group.group, group.items);

  const sections = CAPABILITY_GROUPS.map((group) => ({
    group,
    enabled: enabledByGroup.get(group) ?? [],
    disabled: set.disabled.filter((entry) => entry.capability.group === group),
  })).filter((section) => section.enabled.length > 0 || section.disabled.length > 0);

  return (
    <section className={cn(panelClass, "flex flex-col gap-4")} aria-label={wb(lang, "actions")}>
      {sections.map(({ group, enabled, disabled }) => (
        <div key={group} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-(--muted-fg)">{wb(lang, GROUP_KEY[group])}</h3>
          <div className="flex flex-wrap gap-2">
            {enabled.map((entry) => {
              const id = entry.capability.id;
              const available = isRenderable(id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!available}
                  aria-pressed={activeId === id}
                  onClick={() => onSelect(id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-50",
                    activeId === id
                      ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                      : "border-(--border) bg-(--bg) text-(--fg) hover:bg-(--surface)",
                  )}
                >
                  {capabilityLabel(lang, id)}
                  {!available && <span className="font-normal text-(--muted-fg)">{wb(lang, "unavailable")}</span>}
                </button>
              );
            })}
            {disabled.map((entry) => {
              const reason = entry.match.reason ? wb(lang, entry.match.reason) : wb(lang, "unavailable");
              return (
                <button
                  key={entry.capability.id}
                  type="button"
                  disabled
                  title={reason}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-(--border) bg-(--bg) px-3 text-xs font-medium text-(--muted-fg) opacity-60"
                >
                  {capabilityLabel(lang, entry.capability.id)}
                  <span className="font-normal">{reason}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ----------------------------------------------------------- operation host */

export interface OperationHostProps {
  id: CapabilityId;
  lang: AppLang;
  assets: readonly Asset[];
  params?: Record<string, unknown>;
  setParams?: (patch: Record<string, unknown>) => void;
  onProduce?: (output: OperationOutput) => void;
  /** Injected components bypass the lazy registry (tests, future presets). */
  operations?: OperationRegistry;
  seed?: string | null;
  onUse?: (text: string) => void;
  busy?: boolean;
}

/**
 * Lazily loads and mounts the operation for `id`. The shell keys this on the
 * capability id, so switching operations remounts and never leaks a draft.
 */
export function OperationHost({
  id,
  lang,
  assets,
  params,
  setParams,
  onProduce,
  operations,
  seed = null,
  onUse,
  busy = false,
}: OperationHostProps) {
  const injected = operations?.[id];
  // NB: the lazy initialiser is needed because a component is itself a function.
  const [loaded, setLoaded] = React.useState<OperationComponent | null>(() => injected ?? null);

  React.useEffect(() => {
    if (injected) {
      setLoaded(() => injected);
      return;
    }
    let cancelled = false;
    void loadOperation(id).then((component) => {
      if (!cancelled) setLoaded(() => component);
    });
    return () => {
      cancelled = true;
    };
  }, [id, injected]);

  if (!loaded) {
    return <p className="text-sm text-(--muted-fg)">{wb(lang, "loading")}</p>;
  }

  const extras: Record<string, unknown> = {};
  if (id === "image.strip") extras.defaultTask = "strip";
  else if (id === "image.convert" || id === "image.transform") extras.defaultTask = "convert";
  if (id === "qr.generate") extras.seed = seed;
  if (id === "qr.scan") extras.onUse = onUse;

  const Component = loaded as unknown as React.ComponentType<OperationProps & Record<string, unknown>>;
  return (
    <Component
      lang={lang}
      assets={assets}
      params={params}
      setParams={setParams}
      onProduce={onProduce}
      busy={busy}
      {...extras}
    />
  );
}

/* -------------------------------------------------------------- output tray */

export interface OutputEntry {
  id: string;
  output: OperationOutput;
}

export interface OutputTrayProps {
  lang: AppLang;
  outputs: readonly OutputEntry[];
  onOpenAsAsset: (entry: OutputEntry) => void;
  onRemove: (id: string) => void;
}

export function OutputTray({ lang, outputs, onOpenAsAsset, onRemove }: OutputTrayProps) {
  return (
    <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="wb-outputs">
      <h2 id="wb-outputs" className="text-sm font-semibold">
        {wb(lang, "outputs")}
      </h2>
      {outputs.length === 0 ? (
        <p className="text-sm text-(--muted-fg)">{wb(lang, "noOutputs")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {outputs.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--border) bg-(--bg) px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium" title={entry.output.name}>
                  {entry.output.name}
                </span>
                <span className="text-xs text-(--muted-fg)">{formatBytes(entry.output.bytes.length)}</span>
              </div>
              <ActionButton
                variant="secondary"
                className="h-8 px-3 text-xs"
                onClick={() =>
                  saveBlob(
                    new Blob([entry.output.bytes as unknown as BlobPart], { type: entry.output.type }),
                    entry.output.name,
                  )
                }
              >
                <Download aria-hidden="true" className="size-3.5" />
                {wb(lang, "download")}
              </ActionButton>
              <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => onOpenAsAsset(entry)}>
                {wb(lang, "openAsAsset")}
              </ActionButton>
              <button
                type="button"
                aria-label={wb(lang, "removeOutput", { name: entry.output.name })}
                onClick={() => onRemove(entry.id)}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-(--muted-fg) transition-colors hover:bg-(--surface) hover:text-(--fg) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ shell */

export interface WorkbenchAppProps {
  operations?: OperationRegistry;
}

export default function WorkbenchApp({ operations }: WorkbenchAppProps = {}) {
  const lang = useAppLang();

  // Single owner of every piece of shell state.
  const [assets, setAssets] = React.useState<readonly Asset[]>([]);
  const [activeId, setActiveId] = React.useState<CapabilityId | null>(null);
  const [paramsById, setParamsById] = React.useState<Record<string, Record<string, unknown>>>({});
  const [outputs, setOutputs] = React.useState<OutputEntry[]>([]);
  const [seedText, setSeedText] = React.useState<string | null>(null);
  const outputSeq = React.useRef(0);

  const addFiles = React.useCallback((files: File[]) => {
    if (files.length === 0) return;
    setAssets((current) => [...current, ...files.map((file) => createAssetFromFile(file))]);
  }, []);

  const addText = React.useCallback((text: string) => {
    if (text === "") return;
    setAssets((current) => [...current, createAssetFromText("paste.txt", text)]);
  }, []);

  const removeAsset = React.useCallback((assetId: string) => {
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
  }, []);

  const clearAssets = React.useCallback(() => setAssets([]), []);

  // Per-capability parameters: an operation can never stomp another's draft.
  const setParamsFor = React.useCallback(
    (id: CapabilityId) => (patch: Record<string, unknown>) =>
      setParamsById((current) => ({ ...current, [id]: { ...current[id], ...patch } })),
    [],
  );

  const handleProduce = React.useCallback((output: OperationOutput) => {
    outputSeq.current += 1;
    const id = `output-${outputSeq.current}`;
    setOutputs((current) => [...current, { id, output }]);
  }, []);

  const removeOutput = React.useCallback((id: string) => {
    setOutputs((current) => current.filter((entry) => entry.id !== id));
  }, []);

  // The ONLY path from an output back into the selection — never automatic,
  // otherwise an operation that publishes while reading its own output loops.
  const openAsAsset = React.useCallback((entry: OutputEntry) => {
    const asset = createAssetFromBytes(entry.output.name, entry.output.bytes, entry.output.kind);
    setAssets((current) => [...current, asset]);
    setOutputs((current) => current.filter((item) => item.id !== entry.id));
  }, []);

  const handleUse = React.useCallback((text: string) => {
    // A scan yields text: make it the selection so `qr.generate` applies to the
    // current assets, then switch to it. Without this the active guard below
    // would immediately close it (generate needs a textual single).
    setAssets([createAssetFromText("scanned.txt", text)]);
    setSeedText(text);
    setActiveId("qr.generate");
  }, []);

  const set = React.useMemo(() => capabilitiesFor(assets), [assets]);
  // Promotions must come from capabilities that actually render; unregistered
  // viewer operations would otherwise be suggested but lead nowhere.
  const renderable = React.useMemo(
    () => set.enabled.filter((entry) => hasOperation(entry.capability.id) || operations?.[entry.capability.id] !== undefined),
    [set, operations],
  );
  const primaries = renderable.slice(0, PRIMARY_COUNT);
  const isRenderable = React.useCallback(
    (id: CapabilityId) => hasOperation(id) || operations?.[id] !== undefined,
    [operations],
  );
  // Never leave a stale operation mounted after the selection changes shape:
  // the active capability must still apply (and be renderable) to the assets.
  const active = React.useMemo(
    () => (activeId !== null && renderable.some((entry) => entry.capability.id === activeId) ? activeId : null),
    [activeId, renderable],
  );
  React.useEffect(() => {
    if (activeId !== null && active === null) setActiveId(null);
  }, [active, activeId]);
  // A scan hands its text to generate once; never re-apply it on a later visit.
  React.useEffect(() => {
    if (seedText !== null && active !== "qr.generate") setSeedText(null);
  }, [active, seedText]);

  return (
    <ToolPage title={wb(lang, "title")} tagline={wb(lang, "tagline")} wide>
      <InputBar lang={lang} onFiles={addFiles} onText={addText} compact={assets.length > 0} />

      {assets.length === 0 ? (
        <p className="text-sm text-(--muted-fg)">{wb(lang, "empty")}</p>
      ) : (
        <>
          <AssetTray lang={lang} assets={assets} onRemove={removeAsset} onClear={clearAssets} />
          <SuggestedNext lang={lang} items={primaries} onSelect={setActiveId} />
          <ActionRail lang={lang} set={set} isRenderable={isRenderable} activeId={active} onSelect={setActiveId} />
          {active && (
            <OperationHost
              key={active}
              id={active}
              lang={lang}
              assets={assets}
              params={paramsById[active]}
              setParams={setParamsFor(active)}
              onProduce={handleProduce}
              operations={operations}
              seed={seedText}
              onUse={handleUse}
            />
          )}
        </>
      )}

      <OutputTray lang={lang} outputs={outputs} onOpenAsAsset={openAsAsset} onRemove={removeOutput} />
    </ToolPage>
  );
}
