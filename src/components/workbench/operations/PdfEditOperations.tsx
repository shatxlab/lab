/**
 * `pdf.edit` — Adobe-Reader-level PDF editing.
 *
 * The first slice covers document properties (metadata); this slice adds form
 * filling and optional flattening. Everything runs locally on the
 * `@cantoo/pdf-lib` document the workbench already loads through `loadPdf`.
 * The operation seeds a draft from the six standard Info-dictionary fields and
 * from the AcroForm fields, lets the user edit them, and only writes the file
 * back on an explicit Save. Annotations, signatures and redaction are
 * deliberately left for follow-ups.
 *
 * Password-protected files are out of scope for this editor: instead of a
 * half-working unlock flow we surface the existing `tp` message and stop.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  type PDFDocument,
  type PDFField,
  type PDFFont,
} from "@cantoo/pdf-lib";

import { ActionButton, FilePicker, inputClass, labelClass, panelClass, textareaClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { formatBytesLimit, MAX_FILE_BYTES } from "@/lib/limits";
import { redactPdf, type RedactionMark } from "@/lib/pdf/edit";
import { tp } from "@/lib/pdf/i18n";
import { loadPdf, PdfOpError } from "@/lib/pdf/ops";
import { canvasRedactionRenderer } from "@/lib/pdf/redact-render";
import { createAssetFromFile, type Asset } from "@/lib/workbench/asset";
import { wb, type WorkbenchKey } from "@/lib/workbench/i18n";
import type { OperationProps } from "@/lib/workbench/operation";
import { baseFileName } from "@/lib/viewer/export";
import { openPdf } from "@/lib/viewer/pdf";
import { cn } from "@/lib/viewer/utils";

/** The five editable document properties. */
type MetadataKey = "title" | "author" | "subject" | "keywords" | "creator";

interface MetadataDraft {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
}

/** Display order for the fields. */
const METADATA_FIELDS: readonly { key: MetadataKey; labelKey: WorkbenchKey }[] = [
  { key: "title", labelKey: "metaTitle" },
  { key: "author", labelKey: "metaAuthor" },
  { key: "subject", labelKey: "metaSubject" },
  { key: "keywords", labelKey: "metaKeywords" },
  { key: "creator", labelKey: "metaCreator" },
];

/** Read the editable properties, normalising pdf-lib's `undefined` to `""`. */
function readDraft(doc: PDFDocument): MetadataDraft {
  return {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords() ?? "",
    creator: doc.getCreator() ?? "",
  };
}

function draftEquals(a: MetadataDraft, b: MetadataDraft): boolean {
  return (
    a.title === b.title &&
    a.author === b.author &&
    a.subject === b.subject &&
    a.keywords === b.keywords &&
    a.creator === b.creator
  );
}

/**
 * Supported form-field shapes. Buttons and signatures are display-only and are
 * skipped, so they never appear in the draft.
 */
type FormFieldKind = "text" | "multiline" | "checkbox" | "dropdown" | "radio" | "optionlist";

interface FormFieldDescriptor {
  name: string;
  kind: FormFieldKind;
  options: readonly string[];
}

type FormValue = string | boolean;

interface FormState {
  /** Whether the document has *any* AcroForm field (including unsupported ones). */
  hasForm: boolean;
  fields: FormFieldDescriptor[];
  values: Record<string, FormValue>;
}

const EMPTY_FORM_STATE: FormState = { hasForm: false, fields: [], values: {} };

function formEquals(a: Record<string, FormValue>, b: Record<string, FormValue>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Snapshot the form's supported fields and their current values. Every read is
 * wrapped so a single malformed field can never take down the editor.
 */
function readFormState(doc: PDFDocument): FormState {
  const fields: FormFieldDescriptor[] = [];
  const values: Record<string, FormValue> = {};
  let raw: PDFField[];
  try {
    raw = doc.getForm().getFields();
  } catch {
    return { ...EMPTY_FORM_STATE, fields, values };
  }
  for (const field of raw) {
    try {
      const name = field.getName();
      if (field instanceof PDFTextField) {
        fields.push({ name, kind: field.isMultiline() ? "multiline" : "text", options: [] });
        values[name] = field.getText() ?? "";
      } else if (field instanceof PDFCheckBox) {
        fields.push({ name, kind: "checkbox", options: [] });
        values[name] = field.isChecked();
      } else if (field instanceof PDFDropdown) {
        fields.push({ name, kind: "dropdown", options: [...field.getOptions()] });
        values[name] = field.getSelected()[0] ?? "";
      } else if (field instanceof PDFRadioGroup) {
        fields.push({ name, kind: "radio", options: [...field.getOptions()] });
        values[name] = field.getSelected() ?? "";
      } else if (field instanceof PDFOptionList) {
        fields.push({ name, kind: "optionlist", options: [...field.getOptions()] });
        values[name] = field.getSelected()[0] ?? "";
      }
      // PDFButton / PDFSignature / anything else: display-only, render nothing.
    } catch {
      // A malformed field must not break the editor.
    }
  }
  return { hasForm: raw.length > 0, fields, values };
}

/**
 * Apply the changed values back onto the document. Only fields whose value
 * differs from the baseline are touched, and each write is isolated so one bad
 * field cannot abort the save.
 */
function applyFormValues(
  doc: PDFDocument,
  fields: readonly FormFieldDescriptor[],
  baseline: Record<string, FormValue>,
  draft: Record<string, FormValue>,
): void {
  if (formEquals(baseline, draft)) return;
  const form = doc.getForm();
  for (const field of fields) {
    const next = draft[field.name];
    if (next === undefined || next === baseline[field.name]) continue;
    try {
      switch (field.kind) {
        case "text":
        case "multiline":
          form.getTextField(field.name).setText(String(next));
          break;
        case "checkbox":
          if (next) form.getCheckBox(field.name).check();
          else form.getCheckBox(field.name).uncheck();
          break;
        case "dropdown":
          form.getDropdown(field.name).select(String(next));
          break;
        case "radio":
          if (String(next)) form.getRadioGroup(field.name).select(String(next));
          else form.getRadioGroup(field.name).clear();
          break;
        case "optionlist":
          form.getOptionList(field.name).select(String(next));
          break;
      }
    } catch {
      // Skip fields the library refuses to write rather than failing the save.
    }
  }
}

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

/** A labelled control for one supported form field. */
function FormFieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FormFieldDescriptor;
  value: FormValue | undefined;
  disabled: boolean;
  onChange: (value: FormValue) => void;
}) {
  if (field.kind === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm font-medium text-(--fg)">
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.name}
      </label>
    );
  }

  if (field.kind === "multiline") {
    return (
      <label className={labelClass}>
        {field.name}
        <textarea
          className={textareaClass}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  if (field.kind === "text") {
    return (
      <label className={labelClass}>
        {field.name}
        <input
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  // Dropdowns, radio groups and option lists all render as a single-select.
  // Full multi-select for option lists is out of scope for this slice.
  const current = typeof value === "string" ? value : "";
  return (
    <label className={labelClass}>
      {field.name}
      <select
        className={inputClass}
        value={current}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value=""></option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {current !== "" && !field.options.includes(current) && <option value={current}>{current}</option>}
      </select>
    </label>
  );
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

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
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

export function PdfEditOperation({ lang, assets, onProduce }: OperationProps) {
  const standalone = assets.length === 0;
  const [localAsset, setLocalAsset] = React.useState<Asset | null>(null);
  const asset = assets[0] ?? localAsset;

  const [doc, setDoc] = React.useState<PDFDocument | null>(null);
  const [baseline, setBaseline] = React.useState<MetadataDraft | null>(null);
  const [draft, setDraft] = React.useState<MetadataDraft | null>(null);
  const [producer, setProducer] = React.useState("");
  const [loadedId, setLoadedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Form state: descriptors are stable; values/baseline are keyed by field name.
  const [formFields, setFormFields] = React.useState<FormFieldDescriptor[]>([]);
  const [formValues, setFormValues] = React.useState<Record<string, FormValue>>({});
  const [formBaseline, setFormBaseline] = React.useState<Record<string, FormValue>>({});
  const [hasForm, setHasForm] = React.useState(false);
  const [flatten, setFlatten] = React.useState(false);

  // Pending stamps: staged in state, written to the document on Save, then
  // cleared. Several stamps may be queued, and the list participates in the
  // dirty computation.
  const [pendingStamps, setPendingStamps] = React.useState<PendingStamp[]>([]);
  const stampId = React.useRef(0);

  // Pending redactions: staged rectangles, rasterised on Save and only cleared
  // once the redacted file has actually been produced. They also count as dirty.
  const [pendingRedactions, setPendingRedactions] = React.useState<RedactionMark[]>([]);
  const redactionId = React.useRef(0);

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

  // Redaction form.
  const [redactPage, setRedactPage] = React.useState("1");
  const [redactX, setRedactX] = React.useState("0");
  const [redactY, setRedactY] = React.useState("0");
  const [redactWidth, setRedactWidth] = React.useState("100");
  const [redactHeight, setRedactHeight] = React.useState("40");

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
    setPendingRedactions([]);
    setSignImage(null);
  }, [clearPreview]);

  const resetForm = React.useCallback(() => {
    setFormFields([]);
    setFormValues({});
    setFormBaseline({});
    setHasForm(false);
    setFlatten(false);
  }, []);

  // The load effect keys on the asset, not the language, so switching the UI
  // language never discards an in-progress draft; errors still use the live
  // language through this ref.
  const langRef = React.useRef(lang);
  langRef.current = lang;

  React.useEffect(() => {
    // A new asset starts from a clean slate: previously staged stamps belong to
    // the previous document.
    resetStamps();
    if (!asset) {
      setDoc(null);
      setBaseline(null);
      setDraft(null);
      setLoadedId(null);
      setLoading(false);
      setMessage(null);
      resetForm();
      return;
    }

    if (asset.size > MAX_FILE_BYTES) {
      setDoc(null);
      setBaseline(null);
      setDraft(null);
      setLoadedId(null);
      setLoading(false);
      setMessage(tp(langRef.current, "tooLarge", { name: asset.name, limit: formatBytesLimit(MAX_FILE_BYTES) }));
      resetForm();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessage(null);
    void (async () => {
      try {
        const loaded = await loadPdf(await asset.bytes());
        if (cancelled) return;
        const initial = readDraft(loaded);
        const initialForm = readFormState(loaded);
        setDoc(loaded);
        setBaseline(initial);
        setDraft({ ...initial });
        setProducer(loaded.getProducer() ?? "");
        setLoadedId(asset.id);
        setFormFields(initialForm.fields);
        setFormValues({ ...initialForm.values });
        setFormBaseline(initialForm.values);
        setHasForm(initialForm.hasForm);
        setFlatten(false);
      } catch (error) {
        if (cancelled) return;
        setDoc(null);
        setBaseline(null);
        setDraft(null);
        setLoadedId(null);
        setMessage(errorMessage(langRef.current, error, asset.name));
        resetForm();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset, resetForm, resetStamps]);

  const ready = !loading && doc !== null && draft !== null && baseline !== null && loadedId === asset?.id;
  const metadataDirty = ready && !draftEquals(draft!, baseline!);
  const formDirty = ready && hasForm && (!formEquals(formValues, formBaseline) || flatten);
  const stampsDirty = pendingStamps.length > 0;
  const redactionsDirty = pendingRedactions.length > 0;
  const dirty = metadataDirty || formDirty || stampsDirty || redactionsDirty;

  const setField = (key: MetadataKey, value: string) => {
    setMessage(null);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const setFormValue = (name: string, value: FormValue) => {
    setMessage(null);
    setFormValues((current) => ({ ...current, [name]: value }));
  };

  const revert = () => {
    if (baseline) setDraft({ ...baseline });
    setFormValues({ ...formBaseline });
    setFlatten(false);
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

  const addRedaction = () => {
    setMessage(null);
    const pageCount = doc?.getPageCount() ?? 0;
    const page = Math.max(1, Math.round(numberOr(redactPage, 1)));
    if (!doc || page > pageCount) {
      // Never stage a mark for a page that does not exist: `redactPdf` refuses
      // to publish a page it could not replace, so surface it here instead.
      setMessage(tp(lang, "errRange", { token: String(page), total: pageCount }));
      return;
    }
    redactionId.current += 1;
    setPendingRedactions((current) => [
      ...current,
      {
        id: `redaction-${redactionId.current}`,
        page,
        x: numberOr(redactX, 0),
        y: numberOr(redactY, 0),
        width: Math.max(1, numberOr(redactWidth, 1)),
        height: Math.max(1, numberOr(redactHeight, 1)),
      },
    ]);
  };

  const removeRedaction = (id: string) => {
    setMessage(null);
    setPendingRedactions((current) => current.filter((mark) => mark.id !== id));
  };

  const save = async () => {
    if (!asset || !doc || !draft || !baseline) return;
    setBusy(true);
    setMessage(null);
    try {
      // Only touch the fields that actually changed, so an untouched properties
      // set is never rewritten (and pdf-lib never stamps its own producer).
      if (draft.title !== baseline.title) doc.setTitle(draft.title);
      if (draft.author !== baseline.author) doc.setAuthor(draft.author);
      if (draft.subject !== baseline.subject) doc.setSubject(draft.subject);
      if (draft.creator !== baseline.creator) doc.setCreator(draft.creator);
      if (draft.keywords !== baseline.keywords) {
        doc.setKeywords(
          draft.keywords
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
        );
      }

      if (hasForm) {
        applyFormValues(doc, formFields, formBaseline, formValues);
        // Regenerate appearance streams so filled values render even after a
        // flatten; `save` would do this too but flattening relies on it.
        doc.getForm().updateFieldAppearances();
        if (flatten) doc.getForm().flatten();
      }

      // Pending stamps are applied last, right before the file is written. The
      // font is embedded once and reused; each stamp is isolated so a bad text
      // or image cannot abort the whole save.
      if (pendingStamps.length > 0) {
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
      }

      const bytes = await doc.save();

      // True redaction runs on the bytes just written: every affected page is
      // rasterised with the marks baked into the pixels and swapped in. If it
      // fails for any reason we must not publish a file that still contains the
      // hidden content, so surface the error and leave the draft dirty.
      let finalBytes: Uint8Array = bytes;
      if (pendingRedactions.length > 0) {
        let pdf: Awaited<ReturnType<typeof openPdf>> | undefined;
        try {
          pdf = await openPdf(bytes);
          finalBytes = await redactPdf(bytes, pendingRedactions, canvasRedactionRenderer(pdf));
          if (finalBytes.length === 0) throw new Error("redaction produced no output");
        } catch (error) {
          setMessage(tp(lang, "errGeneric", { message: error instanceof Error ? error.message : String(error) }));
          return;
        } finally {
          if (pdf) {
            try {
              await pdf.loadingTask.destroy();
            } catch {
              // The loading task may already be gone; destroying is best-effort.
            }
          }
        }
      }

      setBaseline({ ...draft });
      // The stamps are baked into the saved bytes and the redactions into
      // `finalBytes`, so both queues are consumed.
      setPendingStamps([]);
      setPendingRedactions([]);

      // Re-read the (possibly flattened) form so the UI reflects what was saved.
      const nextForm = readFormState(doc);
      setFormFields(nextForm.fields);
      setFormValues({ ...nextForm.values });
      setFormBaseline(nextForm.values);
      setHasForm(nextForm.hasForm);
      setFlatten(false);

      if (onProduce) {
        onProduce({ name: `${baseFileName(asset.name)}-edited.pdf`, type: "application/pdf", bytes: finalBytes, kind: "pdf" });
      } else {
        saveBlob(new Blob([finalBytes as unknown as BlobPart], { type: "application/pdf" }), `${baseFileName(asset.name)}-edited.pdf`);
      }
    } catch (error) {
      setMessage(tp(lang, "errGeneric", { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(false);
    }
  };

  const pick = (file: File) => {
    if (!isPdfFile(file)) {
      setNotice(tp(lang, "onlyPdf"));
      return;
    }
    setNotice(null);
    setLocalAsset(createAssetFromFile(file));
  };

  return (
    <div className="flex flex-col gap-4">
      {standalone && (
        <FilePicker
          lang={lang}
          accept="application/pdf,.pdf"
          prompt={tp(lang, "addPdf")}
          compact
          onFiles={(files) => {
            const file = files[0];
            if (file) pick(file);
          }}
        />
      )}

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
          aria-label={tp(lang, "title")}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {METADATA_FIELDS.map((field) => (
            <label key={field.key} className={labelClass}>
              {wb(lang, field.labelKey)}
              <input
                className={inputClass}
                value={draft![field.key]}
                disabled={busy}
                onChange={(event) => setField(field.key, event.target.value)}
              />
            </label>
          ))}

          {/* Producer identifies the tool that wrote the file; it stays read-only. */}
          <label className={labelClass}>
            {wb(lang, "metaProducer")}
            <input className={inputClass} value={producer} readOnly />
          </label>

          {hasForm && (
            <fieldset className="flex flex-col gap-3 border-t border-(--border) pt-4">
              <legend className="text-sm font-semibold text-(--fg)">{wb(lang, "formFields")}</legend>
              {formFields.map((field, index) => (
                <FormFieldInput
                  key={`${field.name}-${index}`}
                  field={field}
                  value={formValues[field.name]}
                  disabled={busy}
                  onChange={(value) => setFormValue(field.name, value)}
                />
              ))}
              <label className="flex items-center gap-2 text-sm font-medium text-(--fg)">
                <input
                  type="checkbox"
                  checked={flatten}
                  disabled={busy}
                  onChange={(event) => {
                    setMessage(null);
                    setFlatten(event.target.checked);
                  }}
                />
                {wb(lang, "flattenForms")}
              </label>
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-4 border-t border-(--border) pt-4">
            <legend className="text-sm font-semibold text-(--fg)">{wb(lang, "stamps")}</legend>

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
          </fieldset>

          <fieldset className="flex flex-col gap-4 border-t border-(--border) pt-4">
            <legend className="text-sm font-semibold text-(--fg)">{wb(lang, "redactions")}</legend>
            <p className="text-sm text-(--muted-fg)">{wb(lang, "redactHint")}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StampNumberField label={wb(lang, "stampPage")} value={redactPage} min={1} disabled={busy} onChange={setRedactPage} />
              <StampNumberField label={wb(lang, "stampX")} value={redactX} min={0} disabled={busy} onChange={setRedactX} />
              <StampNumberField label={wb(lang, "stampY")} value={redactY} min={0} disabled={busy} onChange={setRedactY} />
              <StampNumberField label={wb(lang, "stampWidth")} value={redactWidth} min={1} disabled={busy} onChange={setRedactWidth} />
              <StampNumberField label={wb(lang, "stampHeight")} value={redactHeight} min={1} disabled={busy} onChange={setRedactHeight} />
            </div>

            <div>
              <ActionButton variant="secondary" data-redact="add" disabled={busy} onClick={addRedaction}>
                {wb(lang, "redactAdd")}
              </ActionButton>
            </div>

            {pendingRedactions.length > 0 && (
              <ul className="flex flex-col gap-2">
                {pendingRedactions.map((mark) => (
                  <li
                    key={mark.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-(--border) px-3 py-2 text-sm text-(--fg)"
                  >
                    <span className="truncate">
                      {wb(lang, "stampPage")} {mark.page}
                      <span className="text-(--muted-fg)">
                        {" · "}
                        {mark.x}, {mark.y} · {mark.width}×{mark.height}
                      </span>
                    </span>
                    <ActionButton variant="secondary" disabled={busy} onClick={() => removeRedaction(mark.id)}>
                      {wb(lang, "redactRemove")}
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

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
