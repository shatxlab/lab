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
import { ChevronDown, Download, X } from "lucide-react";

import { ActionButton, FilePicker, Tabs, ToolPage, panelClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { useAppLang } from "@/lib/apps/use-app-lang";
import {
  CAPABILITY_GROUPS,
  PRIMARY_COUNT,
  capabilityById,
  capabilitiesFor,
  unlockedByAnother,
  type CapabilityGroup,
  type CapabilityId,
  type CapabilityMatch,
} from "@/lib/workbench/capabilities";
import { createAssetFromBytes, createAssetFromFile, createAssetFromText, type Asset } from "@/lib/workbench/asset";
import { wb, type WorkbenchKey } from "@/lib/workbench/i18n";
import { hasOperation, loadOperation, operationDefaults } from "@/lib/workbench/operations";
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

/**
 * The open files. A single file collapses to a one-line header; the heading
 * and "Clear all" only appear once there is a list worth managing.
 */
export function AssetTray({ lang, assets, onRemove, onClear }: AssetTrayProps) {
  const single = assets.length === 1;
  return (
    <section className={cn(panelClass, "flex flex-col gap-3", single && "py-2.5")} aria-labelledby="wb-assets">
      {single ? (
        <h2 id="wb-assets" className="sr-only">
          {wb(lang, "assets")}
        </h2>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <h2 id="wb-assets" className="text-sm font-semibold">
            {wb(lang, "assets")}
          </h2>
          <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={onClear}>
            {wb(lang, "clear")}
          </ActionButton>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className={cn("flex items-center gap-3", !single && "rounded-lg border border-(--border) bg-(--bg) px-3 py-2")}
          >
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

/* ----------------------------------------------------------------- starters */

export interface StartersProps {
  lang: AppLang;
  /** Capabilities that work with nothing open (compare text, QR, UUID). */
  starters: readonly CapabilityMatch[];
  activeId: CapabilityId | null;
  onSelect: (id: CapabilityId) => void;
}

/** The empty screen's short "start without a file" row. */
export function Starters({ lang, starters, activeId, onSelect }: StartersProps) {
  if (starters.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="wb-starters">
      <h2 id="wb-starters" className="text-sm text-(--muted-fg)">
        {wb(lang, "startWithout")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {starters.map((entry) => {
          const id = entry.capability.id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={activeId === id}
              onClick={() => onSelect(id)}
              className={cn(
                "inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)",
                activeId === id
                  ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                  : "border-(--border) bg-(--bg) text-(--fg) hover:bg-(--surface)",
              )}
            >
              {capabilityLabel(lang, id)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- action bar */

interface MoreMenuProps {
  lang: AppLang;
  items: readonly CapabilityMatch[];
  activeId: CapabilityId;
  onSelect: (id: CapabilityId) => void;
}

/** The overflow menu: every remaining action, grouped, behind one button. */
function MoreMenu({ lang, items, activeId, onSelect }: MoreMenuProps) {
  const ref = React.useRef<HTMLDetailsElement>(null);

  // A <details> only closes from its own summary; close it on an outside click.
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const details = ref.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const groups = CAPABILITY_GROUPS.map((group) => ({
    group,
    entries: items.filter((entry) => entry.capability.group === group),
  })).filter((section) => section.entries.length > 0);

  return (
    <details ref={ref} className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-(--muted-fg) transition-colors hover:text-(--fg) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) [&::-webkit-details-marker]:hidden">
        {wb(lang, "more")}
        <ChevronDown aria-hidden="true" className="size-4" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-56 flex-col gap-3 rounded-lg border border-(--border) bg-(--surface) p-3 shadow-lg">
        {groups.map(({ group, entries }) => (
          <div key={group} role="group" aria-label={wb(lang, GROUP_KEY[group])} className="flex flex-col gap-1">
            <p aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-(--muted-fg)">
              {wb(lang, GROUP_KEY[group])}
            </p>
            {entries.map((entry) => {
              const id = entry.capability.id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={activeId === id}
                  onClick={() => {
                    if (ref.current) ref.current.open = false;
                    onSelect(id);
                  }}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-(--bg) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)",
                    activeId === id ? "text-(--accent)" : "text-(--fg)",
                  )}
                >
                  {capabilityLabel(lang, id)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </details>
  );
}

export interface ActionBarProps {
  lang: AppLang;
  /** Renderable capabilities for the selection, most relevant first. */
  actions: readonly CapabilityMatch[];
  activeId: CapabilityId;
  onSelect: (id: CapabilityId) => void;
}

/**
 * The action switcher: the most relevant capabilities as tabs and everything
 * else in a grouped "More" menu. An action picked from the menu joins the tabs
 * while it is active, so the selected tab always exists.
 */
export function ActionBar({ lang, actions, activeId, onSelect }: ActionBarProps) {
  const primary = actions.slice(0, PRIMARY_COUNT);
  const overflow = actions.slice(PRIMARY_COUNT);
  const tabs = primary.some((entry) => entry.capability.id === activeId)
    ? primary
    : [...primary, ...overflow.filter((entry) => entry.capability.id === activeId)];

  return (
    <Tabs
      idPrefix="wb-action"
      label={wb(lang, "actions")}
      value={activeId}
      onChange={onSelect}
      tabs={tabs.map((entry) => ({ id: entry.capability.id, label: capabilityLabel(lang, entry.capability.id) }))}
      trailing={
        overflow.length > 0 ? <MoreMenu lang={lang} items={overflow} activeId={activeId} onSelect={onSelect} /> : undefined
      }
    />
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

  const extras: Record<string, unknown> = { ...operationDefaults(id) };
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
  if (outputs.length === 0) return null;
  return (
    <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="wb-outputs">
      <h2 id="wb-outputs" className="text-sm font-semibold">
        {wb(lang, "outputs")}
      </h2>
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
  // The user's explicit choice; null means "use the suggested action".
  const [activeId, setActiveId] = React.useState<CapabilityId | null>(null);
  const [paramsById, setParamsById] = React.useState<Record<string, Record<string, unknown>>>({});
  const [outputs, setOutputs] = React.useState<OutputEntry[]>([]);
  const [seedText, setSeedText] = React.useState<string | null>(null);
  const outputSeq = React.useRef(0);

  const addFiles = React.useCallback((files: File[]) => {
    if (files.length === 0) return;
    setAssets((current) => [...current, ...files.map((file) => createAssetFromFile(file))]);
    setActiveId(null);
  }, []);

  const addText = React.useCallback((text: string) => {
    if (text === "") return;
    setAssets((current) => [...current, createAssetFromText("paste.txt", text)]);
    setActiveId(null);
  }, []);

  const removeAsset = React.useCallback((assetId: string) => {
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
    setActiveId(null);
  }, []);

  const clearAssets = React.useCallback(() => {
    setAssets([]);
    setActiveId(null);
  }, []);

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
    setActiveId(null);
  }, []);

  const handleUse = React.useCallback((text: string) => {
    // A scan yields text: make it the selection so `qr.generate` applies to the
    // current assets, then switch to it. Without this the active guard below
    // would immediately close it (generate needs a textual single).
    setAssets([createAssetFromText("scanned.txt", text)]);
    setSeedText(text);
    setActiveId("qr.generate");
  }, []);

  const isRenderable = React.useCallback(
    (id: CapabilityId) => hasOperation(id) || operations?.[id] !== undefined,
    [operations],
  );
  // Only capabilities that actually render are offered; an unregistered one
  // would be a button that leads nowhere.
  const actions = React.useMemo(
    () => capabilitiesFor(assets).enabled.filter((entry) => isRenderable(entry.capability.id)),
    [assets, isRenderable],
  );
  const hint = React.useMemo(
    () => unlockedByAnother(assets).filter((capability) => isRenderable(capability.id)),
    [assets, isRenderable],
  );
  const empty = assets.length === 0;
  // Every asset change clears the explicit choice, so a drop opens straight
  // into the best action; a choice that no longer applies falls back the same
  // way. With nothing open, actions are the no-file starters and none opens
  // until the user picks one.
  const chosen = activeId !== null && actions.some((entry) => entry.capability.id === activeId) ? activeId : null;
  const active = empty ? chosen : (chosen ?? actions[0]?.capability.id ?? null);
  // A scan hands its text to generate once; never re-apply it on a later visit.
  React.useEffect(() => {
    if (seedText !== null && active !== "qr.generate") setSeedText(null);
  }, [active, seedText]);

  const operation = active && (
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
  );

  return (
    <ToolPage title={wb(lang, "title")} tagline={wb(lang, "tagline")} wide>
      <InputBar lang={lang} onFiles={addFiles} onText={addText} compact={assets.length > 0} />

      {empty ? (
        <>
          <p className="text-sm text-(--muted-fg)">{wb(lang, "empty")}</p>
          <Starters lang={lang} starters={actions} activeId={active} onSelect={setActiveId} />
          {operation}
        </>
      ) : (
        <>
          <AssetTray lang={lang} assets={assets} onRemove={removeAsset} onClear={clearAssets} />
          {hint.length > 0 && (
            <p className="text-sm text-(--muted-fg)">
              {wb(lang, "addMoreHint", { actions: hint.map((capability) => capability.label[lang]).join(", ") })}
            </p>
          )}
          {active && (
            <>
              <ActionBar lang={lang} actions={actions} activeId={active} onSelect={setActiveId} />
              <div
                role="tabpanel"
                id={`wb-action-panel-${active}`}
                aria-labelledby={`wb-action-tab-${active}`}
                className="flex flex-col gap-4"
              >
                {operation}
              </div>
            </>
          )}
        </>
      )}

      <OutputTray lang={lang} outputs={outputs} onOpenAsAsset={openAsAsset} onRemove={removeOutput} />
    </ToolPage>
  );
}
