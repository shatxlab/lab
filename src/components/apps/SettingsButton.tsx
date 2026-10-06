import * as React from "react";
import { DatabaseBackup, Download } from "lucide-react";

import { Modal } from "@/components/apps/Modal";
import { ActionButton, FilePicker } from "@/components/tools/ui";
import {
  applyBackup,
  backupFilename,
  collectBackup,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupFile,
  type ImportMode,
} from "@/lib/apps/backup";
import { saveBlob } from "@/lib/apps/file-open";
import { readAppLang, subscribeToAppLang, type AppLang } from "@/lib/apps/lang";
import { th } from "@/lib/apps/header-i18n";

/** Window event other islands (the command palette) use to open this dialog. */
export const OPEN_SETTINGS_EVENT = "lab:open-settings";
/** Window event asking this island to run an export straight away. */
export const EXPORT_SETTINGS_EVENT = "lab:export-settings";

type Pending = { backup: BackupFile; items: number; groups: string };

/**
 * Header button + dialog for exporting and importing every lab setting
 * (preferences, game progress, reading positions) as a single JSON file.
 */
export default function SettingsButton() {
  const [lang, setLang] = React.useState<AppLang>("en");
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [mode, setMode] = React.useState<ImportMode>("merge");

  React.useEffect(() => {
    setLang(readAppLang());
    return subscribeToAppLang(setLang);
  }, []);

  const exportNow = React.useCallback(() => {
    const backup = collectBackup();
    const count = Object.keys(backup.data).length;
    if (count === 0) {
      setMessage({ kind: "error", text: th(lang, "exportEmpty") });
      return;
    }
    saveBlob(new Blob([serializeBackup(backup)], { type: "application/json" }), backupFilename());
    setMessage({ kind: "ok", text: th(lang, "exportDone", { count }) });
  }, [lang]);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    const onExport = () => {
      setOpen(true);
      exportNow();
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    window.addEventListener(EXPORT_SETTINGS_EVENT, onExport);
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
      window.removeEventListener(EXPORT_SETTINGS_EVENT, onExport);
    };
  }, [exportNow]);

  const close = () => {
    setOpen(false);
    setPending(null);
    setMessage(null);
  };

  const onFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setMessage(null);
    setPending(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMessage({ kind: "error", text: th(lang, "errRead") });
      return;
    }
    const result = parseBackup(text);
    if (!result.ok) {
      const key = ({
        invalid: "errInvalid",
        format: "errFormat",
        version: "errVersion",
        empty: "errEmpty",
        tooLarge: "errTooLarge",
      } as const)[result.error];
      setMessage({ kind: "error", text: th(lang, key) });
      return;
    }
    const summary = summarizeBackup(result.backup);
    setPending({
      backup: result.backup,
      items: summary.keys,
      groups: summary.groups
        .map((group) => {
          const label = th(lang, `group_${group}` as never);
          return label.startsWith("group_") ? group : label;
        })
        .join(", "),
    });
  };

  const apply = () => {
    if (!pending) return;
    applyBackup(pending.backup, mode);
    setMessage({ kind: "ok", text: th(lang, "importDone", { count: pending.items }) });
    setPending(null);
    // Every island read its state at load; a reload is the simplest way to
    // make them all pick up the imported values (including theme and language).
    window.setTimeout(() => window.location.reload(), 700);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={th(lang, "settings")}
        title={th(lang, "settings")}
        aria-haspopup="dialog"
        className="lab-icon-button"
      >
        <DatabaseBackup aria-hidden="true" className="h-4 w-4" />
      </button>

      <Modal open={open} onClose={close} label={th(lang, "settingsTitle")} className="lab-modal-md">
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold">{th(lang, "settingsTitle")}</h2>
            <p className="text-sm text-(--muted-fg)">{th(lang, "settingsIntro")}</p>
          </div>

          <ActionButton onClick={exportNow} className="self-start">
            <Download aria-hidden="true" className="size-4" />
            {th(lang, "export")}
          </ActionButton>

          <section aria-labelledby="lab-import-title" className="flex flex-col gap-3 border-t border-(--border) pt-4">
            <h3 id="lab-import-title" className="text-sm font-semibold">
              {th(lang, "importTitle")}
            </h3>
            <FilePicker lang={lang} accept=".json,application/json" onFiles={onFile} prompt={th(lang, "importPick")} compact />

            {pending && (
              <div className="flex flex-col gap-3 rounded-lg border border-(--border) bg-(--surface) p-3">
                <p className="text-sm">{th(lang, "importFound", { count: pending.items, groups: pending.groups })}</p>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">{th(lang, "importMode")}</legend>
                  {(["merge", "replace"] as const).map((value) => (
                    <label key={value} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="lab-import-mode"
                        value={value}
                        checked={mode === value}
                        onChange={() => setMode(value)}
                        className="mt-1"
                      />
                      <span>{th(lang, value === "merge" ? "modeMerge" : "modeReplace")}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="flex gap-2">
                  <ActionButton onClick={apply}>{th(lang, "importApply")}</ActionButton>
                  <ActionButton variant="secondary" onClick={() => setPending(null)}>
                    {th(lang, "importCancel")}
                  </ActionButton>
                </div>
              </div>
            )}
          </section>

          <p
            role="status"
            aria-live="polite"
            className={message?.kind === "error" ? "text-sm text-(--warning)" : "text-sm text-(--success)"}
          >
            {message?.text ?? ""}
          </p>

          <div className="flex justify-end">
            <ActionButton variant="secondary" onClick={close}>
              {th(lang, "close")}
            </ActionButton>
          </div>
        </div>
      </Modal>
    </>
  );
}
