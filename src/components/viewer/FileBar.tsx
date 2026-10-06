import { Download, FileSpreadsheet, FileText, FileType, FolderOpen, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/viewer/ui/badge";
import { Button } from "@/components/viewer/ui/button";
import type { AppLang } from "@/lib/apps/lang";
import { fileKindLabel } from "@/lib/viewer/i18n";
import type { FileKind } from "@/lib/viewer/file-kind";
import { t } from "@/lib/viewer/i18n";
import { formatBytes } from "@/lib/viewer/utils";

const KIND_ICONS = {
  markdown: FileText,
  sheet: FileSpreadsheet,
  docx: FileType,
  text: FileText,
  json: FileText,
  "legacy-doc": FileType,
  unsupported: FileText,
} satisfies Record<FileKind, typeof FileText>;

/** Set once the reader has changed at least one cell (or added a row). */
export type EditedState = {
  count: number;
  /** Download filename for the edited copy, e.g. `report-edited.xlsx`. */
  filename: string;
  /** True when the original format is not writable, so the copy saves as .xlsx. */
  converted: boolean;
};

type FileBarProps = {
  lang: AppLang;
  name: string;
  size: number;
  kind: FileKind;
  detail?: string;
  edited?: EditedState;
  onOpen: () => void;
  onClose: () => void;
  onDownloadEdited?: () => void;
  onDiscardEdits?: () => void;
};

export function FileBar({ lang, name, size, kind, detail, edited, onOpen, onClose, onDownloadEdited, onDiscardEdits }: FileBarProps) {
  const Icon = KIND_ICONS[kind];

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-(--border) bg-(--bg) px-4 py-3 sm:px-6">
      <Icon className="size-5 shrink-0 text-(--muted-fg)" />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={name}>
          {name}
        </p>
        <p className="text-xs text-(--muted-fg)">
          {[formatBytes(size), detail].filter(Boolean).join(" \u00b7 ")}
        </p>
      </div>

      {edited && <Badge variant="destructive">{edited.count === 1 ? t(lang, "edited") : t(lang, "editedCount", { count: edited.count })}</Badge>}

      <Badge variant="outline" className="hidden sm:inline-flex">
        {fileKindLabel(kind, lang)}
      </Badge>

      {edited && onDownloadEdited && (
        <>
          <Button
            size="sm"
            onClick={onDownloadEdited}
            title={
              edited.converted
                ? t(lang, "savesAsConverted")
                : t(lang, "savesAs", { filename: edited.filename })
            }
          >
            <Download aria-hidden="true" />
            {t(lang, "downloadEdited")}
          </Button>
        </>
      )}

      {edited && onDiscardEdits && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscardEdits}
          aria-label={t(lang, "discardEdits")}
          title={t(lang, "discardEditsTitle")}
        >
          <RotateCcw aria-hidden="true" />
          <span className="hidden sm:inline">{t(lang, "discardEdits")}</span>
        </Button>
      )}

      <Button variant="ghost" size="icon" onClick={onOpen} aria-label={t(lang, "openFile")}>
        <FolderOpen />
      </Button>

      <Button variant="ghost" size="icon" onClick={onClose} aria-label={t(lang, "closeFile")}>
        <X />
      </Button>
    </div>
  );
}
