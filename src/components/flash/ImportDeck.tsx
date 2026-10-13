import * as React from "react";

import { ActionButton, FilePicker, inputClass, labelClass, panelClass, textareaClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { tf } from "@/lib/flash/i18n";
import { deckNameFromFile } from "@/lib/flash/handoff";
import { MAX_DECKS, MAX_NAME_LENGTH, type FlashStore } from "@/lib/flash/model";
import { addDeck } from "@/lib/flash/ops";
import { parseImport } from "@/lib/flash/parse";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const IMPORT_ACCEPT = ".csv,.tsv,.json,.txt,.md,text/*,application/json";

export interface ImportDeckProps {
  lang: AppLang;
  store: FlashStore;
  commit: (update: (store: FlashStore) => FlashStore) => void;
  onCreated: (deckId: string) => void;
}

/** Create a deck from pasted text or a CSV, TSV, JSON or text file. */
export function ImportDeck({ lang, store, commit, onCreated }: ImportDeckProps) {
  const [text, setText] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const parsed = React.useMemo(() => (text.trim() === "" ? null : parseImport(text)), [text]);
  const full = store.decks.length >= MAX_DECKS;

  const readFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError(tf(lang, "importTooBig"));
      return;
    }
    setError("");
    setText(await file.text());
    setName((current) => current || deckNameFromFile(file.name));
  };

  const create = () => {
    if (!parsed || parsed.cards.length === 0 || full) return;
    let id = "";
    commit((current) => {
      const result = addDeck(current, name.trim() || "Deck", parsed.cards);
      id = result.deck?.id ?? "";
      return result.store;
    });
    setText("");
    setName("");
    if (id) onCreated(id);
  };

  return (
    <details className={panelClass}>
      <summary className="cursor-pointer text-sm font-semibold">{tf(lang, "importDeckTitle")}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-(--muted-fg)">{tf(lang, "importDeckHint")}</p>
        <label className={labelClass}>
          {tf(lang, "importPaste")}
          <textarea className={textareaClass} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        </label>
        <FilePicker lang={lang} accept={IMPORT_ACCEPT} onFiles={(files) => void readFile(files)} prompt={tf(lang, "importPick")} compact />
        {error && (
          <p className="text-sm text-(--warning)" role="alert">
            {error}
          </p>
        )}
        {full && <p className="text-xs text-(--muted-fg)">{tf(lang, "importDeckFull", { n: MAX_DECKS })}</p>}
        {parsed && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>{tf(lang, "importFound", { n: parsed.cards.length })}</span>
              {parsed.skipped > 0 && <span className="text-(--muted-fg)">{tf(lang, "importSkipped", { n: parsed.skipped })}</span>}
            </div>
            <label className={labelClass}>
              {tf(lang, "importDeckName")}
              <input className={inputClass} value={name} maxLength={MAX_NAME_LENGTH} onChange={(event) => setName(event.target.value)} />
            </label>
            <div>
              <ActionButton disabled={parsed.cards.length === 0 || full} onClick={create}>
                {tf(lang, "importCreate", { n: parsed.cards.length })}
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
