import * as React from "react";

import { Modal } from "@/components/apps/Modal";
import { ActionButton } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { sh } from "@/lib/share/i18n";

export interface ShareReceiveSheetProps {
  lang: AppLang;
  /** The last attempt with this fragment failed its tag check. */
  wrong: boolean;
  onSubmit: (passphrase: string) => void;
  onDismiss: () => void;
}

/**
 * The passphrase prompt for a `#share=…` fragment. Nothing is shown of the
 * document until decryption succeeds: a wrong passphrase and a damaged link
 * are the same failure, and the text says so.
 */
export function ShareReceiveSheet({ lang, wrong, onSubmit, onDismiss }: ShareReceiveSheetProps) {
  const [passphrase, setPassphrase] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(passphrase);
  };

  return (
    <Modal open onClose={onDismiss} label={sh(lang, "promptTitle")} className="lab-modal-md">
      <form className="flex flex-col gap-3 p-5" onSubmit={submit}>
        <h2 className="text-lg font-semibold">{sh(lang, "promptTitle")}</h2>
        <p className="text-sm">{sh(lang, "promptNote")}</p>
        <input
          ref={inputRef}
          type="text"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          placeholder={sh(lang, "passphrasePlaceholder")}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="rounded-md border border-(--border) bg-(--bg) px-2 py-1.5 text-sm"
        />
        {wrong && <p className="text-sm text-(--danger, #b91c1c)">{sh(lang, "wrongPass")}</p>}
        <div className="flex flex-wrap gap-2">
          <ActionButton type="submit" disabled={passphrase.trim() === ""}>
            {sh(lang, "unlock")}
          </ActionButton>
          <ActionButton variant="secondary" onClick={onDismiss}>
            {sh(lang, "close")}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
