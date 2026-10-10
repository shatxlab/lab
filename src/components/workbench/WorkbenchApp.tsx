/**
 * The workbench shell: the single page for every file.
 *
 * Open files sit in a tray with exactly one *selected* file. The tabs are the
 * capabilities offered for that file — file actions work on it alone, set
 * actions (Merge, Compare, Image) on every open file of their kinds — so a
 * spreadsheet and a photo can be open side by side and each keeps its tools.
 *
 * Rules the shell enforces:
 * - Adding files selects the first new one and opens its best action, unless
 *   the running operation has unsaved work; then the files just join the tray.
 * - Leaving an operation with unsaved work (another tab, another file,
 *   removing its file) asks first.
 * - A produced result joins the tray as the selected file when opened.
 *
 * SSR note: nothing here touches `window`/`document` at module scope — the
 * paste listener and the lazy operation loader only run inside effects.
 */

import * as React from "react";
import { Download, X } from "lucide-react";

import { ActionButton, FilePicker, Tabs, ToolPage, panelClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { useAppLang } from "@/lib/apps/use-app-lang";
import {
  STARTERS,
  capabilitiesFor,
  capabilityById,
  unlockedByAnother,
  type Capability,
  type CapabilityId,
  type OfferedCapability,
} from "@/lib/workbench/capabilities";
import { createAssetFromBytes, createAssetFromFile, createAssetFromText, type Asset } from "@/lib/workbench/asset";
import { wb } from "@/lib/workbench/i18n";
import { loadOperation } from "@/lib/workbench/operations";
import { EMPTY_ASSETS, type OperationComponent, type OperationOutput } from "@/lib/workbench/operation";
import { cn, formatBytes } from "@/lib/viewer/utils";

/** Test seam: pre-resolved operation components keyed by capability. */
export type OperationRegistry = Partial<Record<CapabilityId, OperationComponent>>;

function capabilityLabel(lang: AppLang, id: CapabilityId): string {
  return capabilityById(id)?.label[lang] ?? id;
}

const ICON_BUTTON_CLASS =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-(--muted-fg) transition-colors hover:bg-(--surface) hover:text-(--fg) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)";

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
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/**
 * The open files. A single file collapses to a one-line header; with several,
 * each row selects its file, and "Clear all" appears.
 */
export function AssetTray({ lang, assets, selectedId, onSelect, onRemove, onClear }: AssetTrayProps) {
  const single = assets.length === 1;
  const details = (asset: Asset) => (
    <>
      <span className="truncate font-medium" title={asset.name}>
        {asset.name}
      </span>
      <span className="text-xs text-(--muted-fg)">
        {asset.kind} · {formatBytes(asset.size)}
      </span>
    </>
  );

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
        {assets.map((asset) => {
          const selected = asset.id === selectedId;
          return (
            <li
              key={asset.id}
              className={cn(
                "flex items-center gap-3",
                !single && "rounded-lg border bg-(--bg) px-3 py-2",
                !single && (selected ? "border-(--accent)" : "border-(--border)"),
              )}
            >
              {single ? (
                <div className="flex min-w-0 flex-1 flex-col">{details(asset)}</div>
              ) : (
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(asset.id)}
                  className="flex min-w-0 flex-1 flex-col rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                >
                  {details(asset)}
                </button>
              )}
              <button
                type="button"
                aria-label={wb(lang, "remove", { name: asset.name })}
                onClick={() => onRemove(asset.id)}
                className={ICON_BUTTON_CLASS}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------- starters */

export interface StartersProps {
  lang: AppLang;
  starters: readonly Capability[];
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
        {starters.map(({ id }) => (
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
        ))}
      </div>
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
  onDirtyChange?: (dirty: boolean) => void;
  /** Injected components bypass the lazy registry (tests). */
  operations?: OperationRegistry;
}

/**
 * Lazily loads and mounts the operation for `id`. The shell keys this on the
 * capability and its files, so switching remounts and never leaks a draft.
 */
export function OperationHost({ id, operations, lang, ...props }: OperationHostProps) {
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

  if (!loaded) return <p className="text-sm text-(--muted-fg)">{wb(lang, "loading")}</p>;
  const Component = loaded;
  return <Component lang={lang} {...props} />;
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
                saveBlob(new Blob([entry.output.bytes as unknown as BlobPart], { type: entry.output.type }), entry.output.name)
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
              className={ICON_BUTTON_CLASS}
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
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // The user's explicit tab; null means "the best offered action".
  const [activeId, setActiveId] = React.useState<CapabilityId | null>(null);
  const [paramsById, setParamsById] = React.useState<Record<string, Record<string, unknown>>>({});
  const [outputs, setOutputs] = React.useState<OutputEntry[]>([]);
  // Unsaved work, tagged with the operation that reported it so a newly
  // opened operation never inherits (or loses) another one's state.
  const [dirtyReport, setDirtyReport] = React.useState({ key: "", dirty: false });
  const outputSeq = React.useRef(0);

  // Read through refs so the stable callbacks below always see the latest.
  const dirtyRef = React.useRef(false);
  const activeRef = React.useRef<CapabilityId | null>(null);
  const langRef = React.useRef(lang);
  langRef.current = lang;

  /** True when it is fine to leave the running operation. */
  const confirmLeave = React.useCallback(
    () => !dirtyRef.current || window.confirm(wb(langRef.current, "discardChanges")),
    [],
  );

  /** Add assets; they take focus unless the running operation has unsaved work. */
  const addAssets = React.useCallback((added: Asset[]) => {
    const first = added[0];
    if (!first) return;
    setAssets((current) => [...current, ...added]);
    // Pin the running tab: new files may change which action is "best".
    if (dirtyRef.current) {
      setActiveId(activeRef.current);
      return;
    }
    setSelectedId(first.id);
    setActiveId(null);
  }, []);

  const addFiles = React.useCallback(
    (files: File[]) => addAssets(files.map((file) => createAssetFromFile(file))),
    [addAssets],
  );

  const addText = React.useCallback(
    (text: string) => {
      if (text !== "") addAssets([createAssetFromText("paste.txt", text)]);
    },
    [addAssets],
  );

  const selected = assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null;
  const offered = React.useMemo(() => capabilitiesFor(assets, selected), [assets, selected]);
  const hint = React.useMemo(() => unlockedByAnother(assets, selected), [assets, selected]);
  const empty = assets.length === 0;

  // With files open the explicit tab wins while it is offered, else the best
  // one; on the empty screen nothing opens until a starter is picked.
  const current: OfferedCapability | null = empty
    ? null
    : (offered.find((entry) => entry.capability.id === activeId) ?? offered[0] ?? null);
  const active: CapabilityId | null = empty
    ? STARTERS.some((starter) => starter.id === activeId)
      ? activeId
      : null
    : (current?.capability.id ?? null);
  const operationAssets = current?.assets ?? EMPTY_ASSETS;
  const operationKey = `${active}:${operationAssets.map((asset) => asset.id).join("|")}`;

  dirtyRef.current = dirtyReport.key === operationKey && dirtyReport.dirty;
  activeRef.current = active;
  const reportDirty = React.useCallback(
    (dirty: boolean) => setDirtyReport({ key: operationKey, dirty }),
    [operationKey],
  );

  const selectFile = (id: string) => {
    if (id === selected?.id || !confirmLeave()) return;
    setSelectedId(id);
  };

  const selectAction = (id: CapabilityId) => {
    if (id === active || !confirmLeave()) return;
    setActiveId(id);
  };

  const removeAsset = (id: string) => {
    if (operationAssets.some((asset) => asset.id === id) && !confirmLeave()) return;
    const index = assets.findIndex((asset) => asset.id === id);
    const rest = assets.filter((asset) => asset.id !== id);
    setAssets(rest);
    // Removing the selected file selects its neighbour.
    if (id === selected?.id) setSelectedId((rest[index] ?? rest[index - 1])?.id ?? null);
  };

  const clearAssets = () => {
    if (!confirmLeave()) return;
    setAssets([]);
    setSelectedId(null);
    setActiveId(null);
  };

  // Per-capability parameters: an operation can never stomp another's draft.
  const setParamsFor = React.useCallback(
    (id: CapabilityId) => (patch: Record<string, unknown>) =>
      setParamsById((state) => ({ ...state, [id]: { ...state[id], ...patch } })),
    [],
  );

  const handleProduce = React.useCallback((output: OperationOutput) => {
    outputSeq.current += 1;
    const id = `output-${outputSeq.current}`;
    setOutputs((list) => [...list, { id, output }]);
  }, []);

  const removeOutput = React.useCallback((id: string) => {
    setOutputs((list) => list.filter((entry) => entry.id !== id));
  }, []);

  // The ONLY path from an output back into the tray — never automatic,
  // otherwise an operation that publishes while reading its own output loops.
  const openAsAsset = (entry: OutputEntry) => {
    if (!confirmLeave()) return;
    const asset = createAssetFromBytes(entry.output.name, entry.output.bytes, entry.output.kind);
    setAssets((list) => [...list, asset]);
    setOutputs((list) => list.filter((item) => item.id !== entry.id));
    setSelectedId(asset.id);
    setActiveId(null);
  };

  const operation = active && (
    <OperationHost
      key={operationKey}
      id={active}
      lang={lang}
      assets={operationAssets}
      params={paramsById[active]}
      setParams={setParamsFor(active)}
      onProduce={handleProduce}
      onDirtyChange={reportDirty}
      operations={operations}
    />
  );

  return (
    <ToolPage title={wb(lang, "title")} tagline={wb(lang, "tagline")} wide>
      <InputBar lang={lang} onFiles={addFiles} onText={addText} compact={!empty} />

      {empty ? (
        <>
          <p className="text-sm text-(--muted-fg)">{wb(lang, "empty")}</p>
          <Starters lang={lang} starters={STARTERS} activeId={active} onSelect={selectAction} />
          {operation}
        </>
      ) : (
        <>
          <AssetTray
            lang={lang}
            assets={assets}
            selectedId={selected?.id ?? null}
            onSelect={selectFile}
            onRemove={removeAsset}
            onClear={clearAssets}
          />
          {hint.length > 0 && (
            <p className="text-sm text-(--muted-fg)">
              {wb(lang, "addMoreHint", { actions: hint.map((capability) => capability.label[lang]).join(", ") })}
            </p>
          )}
          {active ? (
            <>
              <Tabs
                idPrefix="wb-action"
                label={wb(lang, "actions")}
                value={active}
                onChange={selectAction}
                tabs={offered.map(({ capability }) => ({ id: capability.id, label: capability.label[lang] }))}
              />
              <div
                role="tabpanel"
                id={`wb-action-panel-${active}`}
                aria-labelledby={`wb-action-tab-${active}`}
                className="flex flex-col gap-4"
              >
                {operation}
              </div>
            </>
          ) : (
            <p className="text-sm text-(--muted-fg)">{wb(lang, "noActions")}</p>
          )}
        </>
      )}

      <OutputTray lang={lang} outputs={outputs} onOpenAsAsset={openAsAsset} onRemove={removeOutput} />
    </ToolPage>
  );
}
