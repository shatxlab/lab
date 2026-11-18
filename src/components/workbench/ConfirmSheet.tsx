/**
 * The "unsaved changes" question, as a dialog instead of window.confirm.
 *
 * Keeping the edits is the primary button and takes focus; discarding is the
 * secondary, warning-coloured one. ESC and a click on the backdrop both mean
 * "keep editing" — the safe answer.
 */

import * as React from "react";

import { ActionButton } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { wb } from "@/lib/workbench/i18n";

export interface ConfirmSheetProps {
  lang: AppLang;
  /** The capability whose edits are at stake, already localised. */
  capabilityLabel: string;
  onKeep: () => void;
  onDiscard: () => void;
}

export function ConfirmSheet({ lang, capabilityLabel, onKeep, onDiscard }: ConfirmSheetProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const keepHandler = React.useRef(onKeep);
  keepHandler.current = onKeep;

  React.useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = () => Array.from(dialogRef.current?.querySelectorAll("button") ?? []);
    buttons()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        keepHandler.current();
      } else if (event.key === "Tab") {
        // Keep focus inside the dialog.
        event.preventDefault();
        const list = buttons();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(at + (event.shiftKey ? list.length - 1 : 1)) % list.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onKeep();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-unsaved-title"
        aria-describedby="wb-unsaved-body"
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-(--border) bg-(--surface) p-4 shadow-xl"
      >
        <h2 id="wb-unsaved-title" className="text-base font-semibold">
          {wb(lang, "unsavedTitle", { name: capabilityLabel })}
        </h2>
        <p id="wb-unsaved-body" className="text-sm text-(--muted-fg)">
          {wb(lang, "unsavedBody")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ActionButton onClick={onKeep}>{wb(lang, "keepEditing")}</ActionButton>
          <ActionButton variant="secondary" className="border-(--warning) text-(--warning)" onClick={onDiscard}>
            {wb(lang, "discardAndContinue")}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
