/**
 * `docx.edit` — a rich-text editor over the HTML the DOCX renderer produced.
 *
 * The loaded document is already sanitized by the loader; the editor keeps
 * the same trust boundary and re-sanitizes on every save. Saving is a lossy
 * regenerate: HTML, Markdown or plain text rather than an OOXML round-trip
 * (the hand-rolled writer is a later follow-up), so editing never promises
 * to preserve Word formatting it cannot see.
 *
 * The surface is an uncontrolled `contentEditable`: React owns the element but
 * never its children, so typing does not clobber the caret. Undo/redo/revert
 * replay `EditSession` snapshots into `innerHTML` instead of `execCommand`,
 * which also makes the history testable without a real editor.
 */

import * as React from "react";

import { EditorToolbar } from "@/components/workbench/EditorToolbar";
import { FilePicker } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { htmlToDocx } from "@/lib/docx/write";
import { baseFileName, htmlToMarkdown, htmlToText, standaloneHtml } from "@/lib/viewer/export";
import { ACCEPTED_EXTENSIONS } from "@/lib/viewer/file-kind";
import { t } from "@/lib/viewer/i18n";
import type { LoadedDocument } from "@/lib/viewer/load";
import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";
import { createAssetFromFile, type Asset } from "@/lib/workbench/asset";
import { createEditSession, type EditFormat, type EditSession } from "@/lib/workbench/editor";
import { wb, type WorkbenchKey } from "@/lib/workbench/i18n";
import type { OperationOutput, OperationProps } from "@/lib/workbench/operation";
import { useViewerDocument } from "@/components/workbench/operations/ViewerOperations";
import { cn } from "@/lib/viewer/utils";

/** The formats the DOCX editor can write; every one is lossy in some way. */
const DOCX_FORMATS: readonly EditFormat[] = [
  {
    id: "html",
    extension: "html",
    mime: "text/html;charset=utf-8",
    label: { en: "HTML (.html)", ru: "HTML (.html)" },
  },
  {
    id: "md",
    extension: "md",
    mime: "text/markdown;charset=utf-8",
    label: { en: "Markdown (.md)", ru: "Markdown (.md)" },
  },
  {
    id: "txt",
    extension: "txt",
    mime: "text/plain;charset=utf-8",
    label: { en: "Text (.txt)", ru: "Текст (.txt)" },
  },
  {
    id: "docx",
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: { en: "Word (.docx)", ru: "Word (.docx)" },
  },
];

/** Sanitize only in a DOM; a server render has no editor to seed anyway. */
function sanitizeHtml(html: string): string {
  return typeof document === "undefined" ? html : sanitizeDocumentHtml(html);
}

/** Reads a standalone operation's file into a local asset. */
function useLocalAsset(): [Asset | null, (file: File) => void] {
  const [asset, setAsset] = React.useState<Asset | null>(null);
  const pick = React.useCallback((file: File) => setAsset(createAssetFromFile(file)), []);
  return [asset, pick];
}

/** The shared picker standalone operations render when no asset is supplied. */
function DocxFilePicker({ lang, onPick }: { lang: AppLang; onPick: (file: File) => void }) {
  return (
    <FilePicker
      lang={lang}
      accept={ACCEPTED_EXTENSIONS.join(",")}
      compact
      onFiles={(files) => {
        const file = files[0];
        if (file) onPick(file);
      }}
    />
  );
}

export function DocxEditOperation({ lang, assets, onProduce }: OperationProps) {
  const standalone = assets.length === 0;
  const [localAsset, pickLocal] = useLocalAsset();
  const asset = assets[0] ?? localAsset;
  const state = useViewerDocument(asset, lang);
  const [error, setError] = React.useState<string | null>(null);

  // A message about the previous asset must not linger over the next one.
  React.useEffect(() => {
    setError(null);
  }, [asset?.id]);

  const emit = React.useCallback(
    async (build: () => Promise<OperationOutput | null>) => {
      setError(null);
      try {
        const output = await build();
        if (!output) return;
        if (onProduce) onProduce(output);
        else saveBlob(new Blob([output.bytes.slice().buffer], { type: output.type }), output.name);
      } catch (err) {
        console.error("Document edit save failed", err);
        setError(t(lang, "exportFailed"));
      }
    },
    [lang, onProduce],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {standalone && (
        <div className="mb-4">
          <DocxFilePicker lang={lang} onPick={pickLocal} />
        </div>
      )}

      {asset && state.status === "loading" && (
        <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
          {t(lang, "readingFile")}
        </p>
      )}

      {asset && state.status === "error" && (
        <p role="alert" className="px-2 py-6 text-center text-sm text-(--warning)">
          {state.message}
        </p>
      )}

      {asset && state.status === "ready" && (
        <>
          {state.doc.kind === "docx" ? (
            <DocxEditPane key={asset.id} lang={lang} asset={asset} doc={state.doc} emit={emit} />
          ) : (
            <p className="px-2 py-6 text-center text-sm text-(--muted-fg)">{wb(lang, "reasonNeedsDocument")}</p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
          {error}
        </p>
      )}
    </div>
  );
}

/** One rich-text command; `value` is the `formatBlock` payload when present. */
type FormatCommand = {
  id: string;
  /** i18n key for the toolbar label (the chrome owns the wording). */
  labelKey: WorkbenchKey;
  text: string;
  command: string;
  value?: string;
};

const FORMAT_COMMANDS: readonly FormatCommand[] = [
  { id: "bold", labelKey: "fmtBold", text: "B", command: "bold" },
  { id: "italic", labelKey: "fmtItalic", text: "I", command: "italic" },
  { id: "underline", labelKey: "fmtUnderline", text: "U", command: "underline" },
  { id: "h1", labelKey: "fmtHeading1", text: "H1", command: "formatBlock", value: "<h1>" },
  { id: "h2", labelKey: "fmtHeading2", text: "H2", command: "formatBlock", value: "<h2>" },
  { id: "ul", labelKey: "fmtBulletList", text: "\u2022", command: "insertUnorderedList" },
  { id: "ol", labelKey: "fmtNumberedList", text: "1.", command: "insertOrderedList" },
  { id: "quote", labelKey: "fmtQuote", text: "\u201C", command: "formatBlock", value: "<blockquote>" },
];

const FORMAT_BUTTON_CLASS =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-(--border) bg-(--bg) px-2 text-xs font-medium text-(--fg) transition-colors hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)";

function DocxEditPane({
  lang,
  asset,
  doc,
  emit,
}: {
  lang: AppLang;
  asset: Asset;
  doc: Extract<LoadedDocument, { kind: "docx" }>;
  emit: (build: () => Promise<OperationOutput | null>) => Promise<void>;
}) {
  const base = baseFileName(asset.name);
  const [session] = React.useState<EditSession<string>>(() =>
    createEditSession<string>({
      initial: sanitizeHtml(doc.html),
      formats: DOCX_FORMATS,
      serialize: (html, formatId) => {
        // Re-sanitize at the trust boundary, not just on load: the surface
        // could hold pasted markup.
        const clean = sanitizeHtml(html);
        if (formatId === "docx") return htmlToDocx(clean, { title: base });
        if (formatId === "md") return `${htmlToMarkdown(clean)}\n`;
        if (formatId === "txt") return `${htmlToText(clean)}\n`;
        return standaloneHtml(base, clean, lang);
      },
    }),
  );
  const [activeFormat, setActiveFormat] = React.useState("html");
  /** Re-render for toolbar state; `revision` also re-seeds the surface. */
  const [, setVersion] = React.useState(0);
  const [revision, setRevision] = React.useState(0);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const bump = React.useCallback(() => setVersion((current) => current + 1), []);

  // Seed once and after every history jump. Typing does not change `revision`,
  // so the caret is never reset mid-edit.
  React.useEffect(() => {
    const node = surfaceRef.current;
    if (node) node.innerHTML = session.value;
  }, [session, revision]);

  const handleInput = React.useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      // Coalesce keystrokes: one continuous edit is a single undo step.
      session.set(event.currentTarget.innerHTML, { coalesce: true });
      bump();
    },
    [session, bump],
  );

  const handleRevert = React.useCallback(() => {
    session.revert();
    setRevision((current) => current + 1);
    bump();
  }, [session, bump]);

  const handleUndo = React.useCallback(() => {
    session.undo();
    setRevision((current) => current + 1);
    bump();
  }, [session, bump]);

  const handleRedo = React.useCallback(() => {
    session.redo();
    setRevision((current) => current + 1);
    bump();
  }, [session, bump]);

  const runCommand = React.useCallback(
    (command: string, value?: string) => {
      if (typeof document === "undefined" || typeof document.execCommand !== "function") return;
      const node = surfaceRef.current;
      if (!node) return;
      node.focus();
      document.execCommand(command, false, value);
      session.set(node.innerHTML, { coalesce: true });
      bump();
    },
    [session, bump],
  );

  const handleLink = React.useCallback(() => {
    if (typeof window === "undefined" || typeof window.prompt !== "function") return;
    let url: string | null = null;
    try {
      url = window.prompt(wb(lang, "linkPrompt"), "https://");
    } catch {
      return;
    }
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    // Bare domains are upgraded to https; anything with a different scheme
    // (notably `javascript:`) is dropped rather than written as a link.
    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
    let protocol: string;
    try {
      protocol = new URL(candidate).protocol;
    } catch {
      return;
    }
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") {
      runCommand("createLink", candidate);
    }
  }, [runCommand]);

  const saveWith = React.useCallback(
    (formatId: string) => {
      void emit(async () => {
        const output = session.output(formatId);
        return {
          // `kind` is deliberately omitted so the output name infers its kind.
          name: output.name(base),
          type: output.mime,
          bytes: output.bytes,
        };
      });
    },
    [base, emit, session],
  );

  const handleSave = React.useCallback(() => saveWith(activeFormat), [saveWith, activeFormat]);
  const handleSaveAs = React.useCallback((id: string) => saveWith(id), [saveWith]);

  return (
    <>
      <EditorToolbar
        lang={lang}
        dirty={session.dirty}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        formats={session.formats}
        activeFormat={activeFormat}
        onFormatChange={setActiveFormat}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onRevert={handleRevert}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <div role="toolbar" aria-label={wb(lang, "formatting")} className="flex flex-wrap items-center gap-1">
        {FORMAT_COMMANDS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-label={wb(lang, entry.labelKey)}
            title={wb(lang, entry.labelKey)}
            // Keep the selection while the toolbar button takes the click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(entry.command, entry.value)}
            className={FORMAT_BUTTON_CLASS}
          >
            {entry.text}
          </button>
        ))}
        <button
          type="button"
          aria-label={wb(lang, "fmtLink")}
          title={wb(lang, "fmtLink")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleLink}
          className={FORMAT_BUTTON_CLASS}
        >
          {"\u{1F517}"}
        </button>
      </div>

      <div
        ref={surfaceRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={asset.name}
        spellCheck
        onInput={handleInput}
        className={cn(
          "doc-prose min-h-96 flex-1 overflow-auto rounded-lg border border-(--border) bg-(--bg) p-4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)",
        )}
      />
    </>
  );
}
