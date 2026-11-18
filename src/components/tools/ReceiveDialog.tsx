import { Modal } from "@/components/apps/Modal";
import { ActionButton } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { ts } from "@/lib/send/i18n";

export interface ReceiveDialogProps {
  lang: AppLang;
  /** What arrived, in the tool's own words ("Deck “Spanish” — 12 cards"). */
  summary: string;
  /** The start of the content itself, so the user can see what they are about to import. */
  preview?: string;
  onImport: () => void;
  onDismiss: () => void;
}

/** The preview step: data from another device is only imported after the user says so. */
export function ReceiveDialog({ lang, summary, preview, onImport, onDismiss }: ReceiveDialogProps) {
  return (
    <Modal open onClose={onDismiss} label={ts(lang, "receiveTitle")} className="lab-modal-md">
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{ts(lang, "receiveTitle")}</h2>
        <p className="text-sm font-medium break-words">{summary}</p>
        {preview ? (
          <pre className="max-h-40 overflow-auto rounded-md border border-(--border) bg-(--bg) p-2 text-xs break-words whitespace-pre-wrap">
            {preview.length > 600 ? `${preview.slice(0, 600)}…` : preview}
          </pre>
        ) : null}
        <p className="text-xs text-(--muted-fg)">{ts(lang, "receiveNote")}</p>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={onImport}>{ts(lang, "import")}</ActionButton>
          <ActionButton variant="secondary" onClick={onDismiss}>
            {ts(lang, "dismiss")}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
