/**
 * The workbench shell: the single page for every file.
 *
 * Open files sit in a tray with exactly one *selected* file. The tabs are the
 * capabilities offered for that file — file actions work on it alone, set
 * actions (Merge, Compare, Edit image) on every open file of their kinds — so a
 * spreadsheet and a photo can be open side by side and each keeps its tools.
 *
 * Rules the shell enforces:
 * - Adding files selects the first new one and opens its best action, unless
 *   the running operation has unsaved work; then the files just join the tray.
 * - Leaving an operation with unsaved work (another tab, another file,
 *   removing its file) asks first, in a dialog that defaults to keeping the work.
 * - Ten or more images are one batch row in the tray, not ten rows.
 * - A file an operation produces without a results list of its own (a chart
 *   export, a signed PDF, a saved copy) is downloaded straight away.
 *
 * SSR note: nothing here touches `window`/`document` at module scope — the
 * paste listener and the lazy operation loader only run inside effects.
 */

import * as React from "react";
import { Images, Smartphone, X } from "lucide-react";

import { AssetThumb, BatchThumb } from "@/components/workbench/AssetThumb";
import { ConfirmSheet } from "@/components/workbench/ConfirmSheet";
import { ReceiveDialog } from "@/components/tools/ReceiveDialog";
import { SendToPhone } from "@/components/tools/SendToPhone";
import { ActionButton, FilePicker, Tabs, ToolPage, panelClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import { withBase } from "@/lib/apps/paths";
import { useIncomingSend } from "@/lib/send/use-incoming";
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
import { createAssetFromFile, createAssetFromText, type Asset } from "@/lib/workbench/asset";
import { imagesLabel, isBatch } from "@/lib/workbench/batch";
import { isTextual } from "@/lib/workbench/kinds";
import { MAX_SENDABLE_BYTES, TEXT_SEND_KIND, parseTextSend, textToSend } from "@/lib/workbench/send";
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

/** A small phone icon that opens "Send to phone" for a text source. */
function SendTextButton({ lang, name, getText }: { lang: AppLang; name: string; getText: () => Promise<string> | string }) {
  return (
    <SendToPhone
      lang={lang}
      kind={TEXT_SEND_KIND}
      toolPath={withBase("/tools")}
      getData={async () => textToSend(name, await getText())}
      trigger={(open) => (
        <button type="button" aria-label={wb(lang, "sendNamed", { name })} onClick={open} className={ICON_BUTTON_CLASS}>
          <Smartphone aria-hidden="true" className="size-4" />
        </button>
      )}
    />
  );
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
  selectedId: string | null;
  /** Ids of the files the running set capability acts on (empty for file capabilities). */
  setMembers?: ReadonlySet<string>;
  /** The running capability; decides how members are badged. */
  activeId?: CapabilityId | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  /** Remove several files at once (a whole image batch). */
  onRemoveMany: (ids: readonly string[]) => void;
  onClear: () => void;
}

/** One line in the tray: a file, or all the images of a batch. */
export type TrayRow = { type: "asset"; asset: Asset } | { type: "batch"; assets: readonly Asset[] };

/**
 * What the tray lists. From `BATCH_MIN` images on they collapse into a single
 * row, placed where the first of them was; everything else keeps its own row.
 */
export function trayRows(assets: readonly Asset[]): TrayRow[] {
  const images = assets.filter((asset) => asset.kind === "image");
  if (!isBatch(images.length)) return assets.map((asset) => ({ type: "asset", asset }));
  const rows: TrayRow[] = [];
  let placed = false;
  for (const asset of assets) {
    if (asset.kind !== "image") rows.push({ type: "asset", asset });
    else if (!placed) {
      rows.push({ type: "batch", assets: images });
      placed = true;
    }
  }
  return rows;
}

/** The marker in front of a file's name: A/B for Compare, 1..n for Merge, a chip for a batch. */
function memberBadge(lang: AppLang, activeId: CapabilityId | null | undefined, position: number): string | null {
  if (activeId === "text.diff") return position < 2 ? ["A", "B"][position]! : null;
  if (activeId === "pdf.merge") return String(position + 1);
  if (activeId === "image.edit" || activeId === "ocr.recognize") return wb(lang, "inBatch");
  return null;
}

/**
 * The open files. A single file collapses to a one-line header; with several,
 * each row selects its file, and "Clear all" appears.
 */
export function AssetTray({
  lang,
  assets,
  selectedId,
  setMembers,
  activeId,
  onSelect,
  onRemove,
  onRemoveMany,
  onClear,
}: AssetTrayProps) {
  const rows = trayRows(assets);
  const single = rows.length === 1 && rows[0]!.type === "asset";
  // Tray order is the order Compare panes and Merge use.
  const memberIds = setMembers && assets.filter((asset) => setMembers.has(asset.id)).map((asset) => asset.id);
  const details = (asset: Asset) => {
    const position = memberIds ? memberIds.indexOf(asset.id) : -1;
    const badge = !single && position >= 0 ? memberBadge(lang, activeId, position) : null;
    return (
      <>
        <span className="flex min-w-0 items-center gap-2">
          {badge && (
            <span data-member-badge className="shrink-0 rounded-full border border-(--accent) px-1.5 text-xs font-semibold text-(--accent)">
              {badge}
            </span>
          )}
          <span className="truncate font-medium" title={asset.name}>
            {asset.name}
          </span>
        </span>
        <span className="text-xs text-(--muted-fg)">
          {asset.kind} · {formatBytes(asset.size)}
        </span>
      </>
    );
  };

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
          {rows.length > 1 && (
            <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={onClear}>
              {wb(lang, "clear")}
            </ActionButton>
          )}
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          if (row.type === "batch") {
            const inBatch = row.assets.some((asset) => asset.id === selectedId);
            const total = row.assets.reduce((sum, asset) => sum + asset.size, 0);
            const count = imagesLabel(lang, row.assets.length);
            return (
              <li
                key="image-batch"
                data-asset-batch=""
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-lg border bg-(--bg) px-3 py-2",
                  inBatch ? "border-(--accent)" : "border-(--border)",
                )}
              >
                <BatchThumb />
                <button
                  type="button"
                  aria-pressed={inBatch}
                  onClick={() => onSelect(inBatch && selectedId ? selectedId : row.assets[0]!.id)}
                  className="flex min-w-0 flex-1 flex-col rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                >
                  <span className="truncate font-medium">{wb(lang, "imageBatch")}</span>
                  <span className="text-xs text-(--muted-fg)">
                    {count} · {formatBytes(total)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={wb(lang, "removeBatch", { count })}
                  onClick={() => onRemoveMany(row.assets.map((asset) => asset.id))}
                  className={ICON_BUTTON_CLASS}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          }
          const { asset } = row;
          const selected = asset.id === selectedId;
          return (
            <li
              key={asset.id}
              className={cn(
                "flex flex-wrap items-center gap-3",
                !single && "rounded-lg border bg-(--bg) px-3 py-2",
                !single && (selected ? "border-(--accent)" : "border-(--border)"),
              )}
            >
              <AssetThumb asset={asset} />
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
              {isTextual(asset.kind) && asset.size <= MAX_SENDABLE_BYTES && (
                <SendTextButton lang={lang} name={asset.name} getText={() => asset.text()} />
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

  if (!loaded) {
    // A toolbar-high skeleton so the panel doesn't jump when the operation arrives.
    return (
      <div aria-busy="true" className="flex min-h-12 flex-col justify-center gap-2 motion-safe:animate-pulse">
        <span className="sr-only">{wb(lang, "loading")}</span>
        <div aria-hidden="true" className="h-3 w-2/3 rounded-full bg-(--muted-fg)/20" />
        <div aria-hidden="true" className="h-3 w-1/3 rounded-full bg-(--muted-fg)/20" />
      </div>
    );
  }
  const Component = loaded;
  return <Component lang={lang} {...props} />;
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
  // Unsaved work, tagged with the operation that reported it so a newly
  // opened operation never inherits (or loses) another one's state.
  const [dirtyReport, setDirtyReport] = React.useState({ key: "", dirty: false });

  // Read through refs so the stable callbacks below always see the latest.
  const dirtyRef = React.useRef(false);
  const activeRef = React.useRef<CapabilityId | null>(null);

  // The leave that is waiting on the unsaved-changes dialog.
  const [pending, setPending] = React.useState<{ run: () => void } | null>(null);

  /** Run `run` now when nothing is unsaved; otherwise ask first. */
  const requestLeave = React.useCallback((run: () => void) => {
    if (dirtyRef.current) setPending({ run });
    else run();
  }, []);

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

  // Text sent from another device waits behind a preview until the user imports it.
  const { incoming, dismiss: dismissIncoming } = useIncomingSend(TEXT_SEND_KIND);
  const received = React.useMemo(() => (incoming ? parseTextSend(incoming.data) : null), [incoming]);
  React.useEffect(() => {
    if (incoming && !received) dismissIncoming();
  }, [incoming, received, dismissIncoming]);
  const importReceived = () => {
    if (!received) return;
    addAssets([createAssetFromText(received.name, received.text)]);
    dismissIncoming();
  };

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
  const setMembers = React.useMemo<ReadonlySet<string>>(
    () => new Set(current && (current.capability.set || current.assets.length > 1) ? current.assets.map((asset) => asset.id) : []),
    [current],
  );
  const operationKey = `${active}:${operationAssets.map((asset) => asset.id).join("|")}`;

  const dirty = dirtyReport.key === operationKey && dirtyReport.dirty;
  dirtyRef.current = dirty;
  activeRef.current = active;
  const reportDirty = React.useCallback(
    (dirty: boolean) => setDirtyReport({ key: operationKey, dirty }),
    [operationKey],
  );

  // Closing or reloading the tab gets the same protection as in-page
  // navigation: the browser asks when the running operation holds unsaved work.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome only shows the dialog when returnValue is set; its text is ignored.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const selectFile = (id: string) => {
    if (id === selected?.id) return;
    requestLeave(() => setSelectedId(id));
  };

  const selectAction = (id: CapabilityId) => {
    if (id === active) return;
    requestLeave(() => setActiveId(id));
  };

  const removeAssets = (ids: readonly string[]) => {
    const gone = new Set(ids);
    const remove = () => {
      setAssets(assets.filter((asset) => !gone.has(asset.id)));
      // Removing the selected file selects its nearest neighbour that stays.
      if (selected && gone.has(selected.id)) {
        const index = assets.indexOf(selected);
        const after = assets.slice(index + 1).find((asset) => !gone.has(asset.id));
        const before = assets.slice(0, index).reverse().find((asset) => !gone.has(asset.id));
        setSelectedId((after ?? before)?.id ?? null);
      }
    };
    if (operationAssets.some((asset) => gone.has(asset.id))) requestLeave(remove);
    else remove();
  };

  const clearAssets = () =>
    requestLeave(() => {
      setAssets([]);
      setSelectedId(null);
      setActiveId(null);
    });

  // Per-capability parameters: an operation can never stomp another's draft.
  const setParamsFor = React.useCallback(
    (id: CapabilityId) => (patch: Record<string, unknown>) =>
      setParamsById((state) => ({ ...state, [id]: { ...state[id], ...patch } })),
    [],
  );

  // A file an operation hands over is saved straight away: there is no second
  // list of results to keep in step with the operation's own.
  const handleProduce = React.useCallback((output: OperationOutput) => {
    saveBlob(new Blob([output.bytes as unknown as BlobPart], { type: output.type }), output.name);
  }, []);

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
            setMembers={setMembers}
            activeId={active}
            onSelect={selectFile}
            onRemove={(id) => removeAssets([id])}
            onRemoveMany={removeAssets}
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

      {received && (
        <ReceiveDialog
          lang={lang}
          summary={wb(lang, "receiveText", { name: received.name, n: received.text.length })}
          preview={received.text}
          onImport={importReceived}
          onDismiss={dismissIncoming}
        />
      )}

      {pending && (
        <ConfirmSheet
          lang={lang}
          capabilityLabel={active ? capabilityLabel(lang, active) : ""}
          onKeep={() => setPending(null)}
          onDiscard={() => {
            const { run } = pending;
            setPending(null);
            run();
          }}
        />
      )}
    </ToolPage>
  );
}
