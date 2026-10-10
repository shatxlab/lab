/**
 * `pdf.sign` — place a signature image or a typed text stamp on a PDF.
 *
 * Stamps are staged in state and only drawn onto the `@cantoo/pdf-lib`
 * document on an explicit Save, which writes a new PDF. Everything runs
 * locally on the document the workbench already loads through `loadPdf`.
 *
 * Password-protected files are out of scope: instead of a half-working unlock
 * flow we surface the existing `tp` message and stop.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { StandardFonts, type PDFDocument, type PDFFont } from "@cantoo/pdf-lib";

import { ActionButton, inputClass, labelClass, panelClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { formatBytesLimit, MAX_FILE_BYTES } from "@/lib/limits";
import { tp } from "@/lib/pdf/i18n";
import { loadPdf, PdfOpError } from "@/lib/pdf/ops";
import { wb } from "@/lib/workbench/i18n";
import type { OperationProps } from "@/lib/workbench/operation";
import { baseFileName } from "@/lib/viewer/export";
import { cn } from "@/lib/viewer/utils";

/**
 * A stamp the user staged but has not written to the PDF yet. Text stamps are
 * drawn with Helvetica; image stamps carry the raw PNG/JPEG bytes and are
 * embedded at save time.
 */
interface TextStamp {
  id: number;
  kind: "text";
  text: string;
  /** 1-based page number; clamped to the document size on save. */
  page: number;
  x: number;
  y: number;
  size: number;
}

interface ImageStamp {
  id: number;
  kind: "image";
  name: string;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type PendingStamp = TextStamp | ImageStamp;

/** The signature file the user picked, before it is staged as a stamp. */
interface SignatureImage {
  name: string;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  previewUrl: string | null;
}

/** Parse a number field, falling back to `fallback` when it is not finite. */
function numberOr(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** A compact labelled number input for the two stamp forms. */
function StampNumberField({
  label,
  value,
  min,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type="number"
        min={min}
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function errorMessage(lang: AppLang, error: unknown, name: string): string {
  if (error instanceof PdfOpError) {
    if (error.code === "tooLarge") return tp(lang, "tooLarge", { name, limit: formatBytesLimit(MAX_FILE_BYTES) });
    if (error.code === "needsPassword") return tp(lang, "locked", { name });
    if (error.code === "wrongPassword") return tp(lang, "wrongPassword");
    return tp(lang, "invalidPdf", { name });
  }
  return tp(lang, "errGeneric", { message: error instanceof Error ? error.message : String(error) });
}

export function PdfSignOperation({ lang, assets, onProduce, onDirtyChange }: OperationProps) {
  const asset = assets[0] ?? null;

  const [doc, setDoc] = React.useState<PDFDocument | null>(null);
  const [loadedId, setLoadedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Pending stamps: staged in state, written to the document on Save, then
  // cleared. Several stamps may be queued; a non-empty queue is what's dirty.
  const [pendingStamps, setPendingStamps] = React.useState<PendingStamp[]>([]);
  const stampId = React.useRef(0);

  // Text-stamp form.
  const [stampText, setStampText] = React.useState("");
  const [stampPage, setStampPage] = React.useState("1");
  const [stampX, setStampX] = React.useState("72");
  const [stampY, setStampY] = React.useState("72");
  const [stampFontSize, setStampFontSize] = React.useState("12");

  // Signature-image form.
  const [signImage, setSignImage] = React.useState<SignatureImage | null>(null);
  const [signPage, setSignPage] = React.useState("1");
  const [signX, setSignX] = React.useState("72");
  const [signY, setSignY] = React.useState("72");
  const [signWidth, setSignWidth] = React.useState("120");
  const [signHeight, setSignHeight] = React.useState("60");

  const previewRef = React.useRef<string | null>(null);
  const clearPreview = React.useCallback(() => {
    if (previewRef.current) {
      try {
        URL.revokeObjectURL(previewRef.current);
      } catch {
        // jsdom has no object-URL support; nothing to release.
      }
      previewRef.current = null;
    }
  }, []);

  React.useEffect(() => () => clearPreview(), [clearPreview]);

  const resetStamps = React.useCallback(() => {
    clearPreview();
    setPendingStamps([]);
    setSignImage(null);
  }, [clearPreview]);

  // The load effect keys on the asset, not the language, so switching the UI
  // language never discards staged stamps; errors still use the live language
  // through this ref.
  const langRef = React.useRef(lang);
  langRef.current = lang;

  React.useEffect(() => {
    // A new asset starts from a clean slate: previously staged stamps belong to
    // the previous document.
    resetStamps();
    setDoc(null);
    setLoadedId(null);
    setMessage(null);
    if (!asset) {
      setLoading(false);
      return;
    }

    if (asset.size > MAX_FILE_BYTES) {
      setLoading(false);
      setMessage(tp(langRef.current, "tooLarge", { name: asset.name, limit: formatBytesLimit(MAX_FILE_BYTES) }));
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const loaded = await loadPdf(await asset.bytes());
        if (cancelled) return;
        setDoc(loaded);
        setLoadedId(asset.id);
      } catch (error) {
        if (cancelled) return;
        setMessage(errorMessage(langRef.current, error, asset.name));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset, resetStamps]);

  const ready = !loading && doc !== null && loadedId === asset?.id;
  const dirty = pendingStamps.length > 0;

  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const revert = () => {
    resetStamps();
    setMessage(null);
  };

  const addTextStamp = () => {
    const text = stampText.trim();
    if (!text) return;
    setMessage(null);
    stampId.current += 1;
    setPendingStamps((current) => [
      ...current,
      {
        id: stampId.current,
        kind: "text",
        text,
        page: Math.max(1, Math.round(numberOr(stampPage, 1))),
        x: numberOr(stampX, 0),
        y: numberOr(stampY, 0),
        size: Math.max(1, numberOr(stampFontSize, 12)),
      },
    ]);
  };

  const pickSignatureImage = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const mime: "image/png" | "image/jpeg" =
        file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name) ? "image/jpeg" : "image/png";
      clearPreview();
      let previewUrl: string | null = null;
      try {
        previewUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
      } catch {
        previewUrl = null;
      }
      previewRef.current = previewUrl;
      setSignImage({ name: file.name, bytes: new Uint8Array(buffer), mime, previewUrl });
    } catch (error) {
      clearPreview();
      setSignImage(null);
      setNotice(tp(lang, "errGeneric", { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  const addImageStamp = () => {
    if (!signImage) return;
    setMessage(null);
    stampId.current += 1;
    setPendingStamps((current) => [
      ...current,
      {
        id: stampId.current,
        kind: "image",
        name: signImage.name,
        bytes: signImage.bytes,
        mime: signImage.mime,
        page: Math.max(1, Math.round(numberOr(signPage, 1))),
        x: numberOr(signX, 0),
        y: numberOr(signY, 0),
        width: Math.max(1, numberOr(signWidth, 120)),
        height: Math.max(1, numberOr(signHeight, 60)),
      },
    ]);
  };

  const removeStamp = (id: number) => {
    setMessage(null);
    setPendingStamps((current) => current.filter((stamp) => stamp.id !== id));
  };

  const save = async () => {
    if (!asset || !doc) return;
    setBusy(true);
    setMessage(null);
    try {
      // The font is embedded once and reused; each stamp is isolated so a bad
      // text or image cannot abort the whole save.
      const pageCount = doc.getPageCount();
      let textFont: PDFFont | null = null;
      for (const stamp of pendingStamps) {
        try {
          const clamped = Math.min(Math.max(stamp.page, 1), Math.max(pageCount, 1));
          const page = doc.getPage(clamped - 1);
          if (stamp.kind === "text") {
            textFont ??= await doc.embedFont(StandardFonts.Helvetica);
            page.drawText(stamp.text, { x: stamp.x, y: stamp.y, size: stamp.size, font: textFont });
          } else {
            const image = stamp.mime === "image/png" ? await doc.embedPng(stamp.bytes) : await doc.embedJpg(stamp.bytes);
            page.drawImage(image, { x: stamp.x, y: stamp.y, width: stamp.width, height: stamp.height });
          }
        } catch {
          // Skip a stamp the library refuses to draw rather than failing Save.
        }
      }

      const bytes = await doc.save();
      // The stamps are baked into the saved bytes, so the queue is consumed.
      setPendingStamps([]);

      const name = `${baseFileName(asset.name)}-signed.pdf`;
      if (onProduce) {
        onProduce({ name, type: "application/pdf", bytes, kind: "pdf" });
      } else {
        saveBlob(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), name);
      }
    } catch (error) {
      setMessage(tp(lang, "errGeneric", { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p role="alert" className="text-sm text-(--warning)">
          {notice}
        </p>
      )}

      {loading && (
        <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
          {wb(lang, "loading")}
        </p>
      )}

      {message && (
        <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
          {message}
        </p>
      )}

      {ready && (
        <form
          className={cn(panelClass, "flex flex-col gap-4")}
          aria-label={wb(lang, "signTitle")}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {/* Signature-image stamp */}
          <div className="flex flex-col gap-3 rounded-lg border border-(--border) p-3">
            <label className={labelClass}>
              {wb(lang, "signImage")}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className={inputClass}
                disabled={busy}
                onChange={(event) => {
                  void pickSignatureImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {signImage && (
              <div className="flex items-center gap-3">
                {signImage.previewUrl && (
                  <img src={signImage.previewUrl} alt={signImage.name} className="h-12 w-auto rounded border border-(--border)" />
                )}
                <span className="text-sm text-(--muted-fg)">{signImage.name}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StampNumberField label={wb(lang, "stampPage")} value={signPage} min={1} disabled={busy} onChange={setSignPage} />
              <StampNumberField label={wb(lang, "stampX")} value={signX} min={0} disabled={busy} onChange={setSignX} />
              <StampNumberField label={wb(lang, "stampY")} value={signY} min={0} disabled={busy} onChange={setSignY} />
              <StampNumberField label={wb(lang, "stampWidth")} value={signWidth} min={1} disabled={busy} onChange={setSignWidth} />
              <StampNumberField label={wb(lang, "stampHeight")} value={signHeight} min={1} disabled={busy} onChange={setSignHeight} />
            </div>
            <div>
              <ActionButton
                variant="secondary"
                data-stamp-kind="image"
                disabled={busy || !signImage}
                onClick={addImageStamp}
              >
                {wb(lang, "stampAdd")}
              </ActionButton>
            </div>
          </div>

          {/* Text stamp */}
          <div className="flex flex-col gap-3 rounded-lg border border-(--border) p-3">
            <label className={labelClass}>
              {wb(lang, "stampTextLabel")}
              <input
                className={inputClass}
                value={stampText}
                disabled={busy}
                onChange={(event) => {
                  setMessage(null);
                  setStampText(event.target.value);
                }}
              />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StampNumberField label={wb(lang, "stampPage")} value={stampPage} min={1} disabled={busy} onChange={setStampPage} />
              <StampNumberField label={wb(lang, "stampX")} value={stampX} min={0} disabled={busy} onChange={setStampX} />
              <StampNumberField label={wb(lang, "stampY")} value={stampY} min={0} disabled={busy} onChange={setStampY} />
              <StampNumberField label={wb(lang, "stampFontSize")} value={stampFontSize} min={1} disabled={busy} onChange={setStampFontSize} />
            </div>
            <div>
              <ActionButton
                variant="secondary"
                data-stamp-kind="text"
                disabled={busy || stampText.trim() === ""}
                onClick={addTextStamp}
              >
                {wb(lang, "stampAdd")}
              </ActionButton>
            </div>
          </div>

          {pendingStamps.length > 0 && (
            <ul className="flex flex-col gap-2">
              {pendingStamps.map((stamp) => (
                <li
                  key={stamp.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-(--border) px-3 py-2 text-sm text-(--fg)"
                >
                  <span className="truncate">
                    {stamp.kind === "text" ? stamp.text : stamp.name}
                    <span className="text-(--muted-fg)">
                      {" · "}
                      {wb(lang, "stampPage")} {stamp.page} · {stamp.x}, {stamp.y}
                    </span>
                  </span>
                  <ActionButton variant="secondary" disabled={busy} onClick={() => removeStamp(stamp.id)}>
                    {wb(lang, "stampRemove")}
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton type="submit" disabled={!dirty || busy}>
              {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {busy ? wb(lang, "loading") : wb(lang, "save")}
            </ActionButton>
            <ActionButton variant="secondary" onClick={revert} disabled={!dirty || busy}>
              {wb(lang, "revert")}
            </ActionButton>
          </div>
        </form>
      )}
    </div>
  );
}
