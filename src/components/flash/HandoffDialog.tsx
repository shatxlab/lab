import * as React from "react";

import { Modal } from "@/components/apps/Modal";
import { ActionButton, SelectField, inputClass, labelClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import type { FlashHandoff } from "@/lib/flash/handoff";
import { deckNameFromFile } from "@/lib/flash/handoff";
import { tf } from "@/lib/flash/i18n";
import { MAX_DECKS, MAX_NAME_LENGTH, type FlashStore } from "@/lib/flash/model";
import { parseImport } from "@/lib/flash/parse";
import { ts } from "@/lib/send/i18n";

export interface HandoffDialogProps {
  lang: AppLang;
  handoff: FlashHandoff;
  store: FlashStore;
  /** `deckId` is null for a new deck, which is called `name`. */
  onConfirm: (target: { deckId: string | null; name: string }, cards: ReturnType<typeof parseImport>["cards"]) => void;
  onDismiss: () => void;
}

const NEW = "";

/** Text sent from the workbench: shows what was found and where it will go. */
export function HandoffDialog({ lang, handoff, store, onConfirm, onDismiss }: HandoffDialogProps) {
  const parsed = React.useMemo(() => parseImport(handoff.text), [handoff.text]);
  const [target, setTarget] = React.useState(NEW);
  const [name, setName] = React.useState(() => deckNameFromFile(handoff.name) || "Deck");
  const full = store.decks.length >= MAX_DECKS && target === NEW;
  const found = parsed.cards.length;

  return (
    <Modal open onClose={onDismiss} label={tf(lang, "handoffTitle")} className="lab-modal-md">
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{tf(lang, "handoffTitle")}</h2>
        {found === 0 ? (
          <p className="text-sm text-(--muted-fg)">{tf(lang, "handoffNothing")}</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {tf(lang, "importFound", { n: found })}
              {parsed.skipped > 0 && <span className="font-normal text-(--muted-fg)"> · {tf(lang, "importSkipped", { n: parsed.skipped })}</span>}
            </p>
            <ul className="max-h-40 overflow-auto rounded-md border border-(--border) bg-(--bg) p-2 text-xs">
              {parsed.cards.slice(0, 5).map((card, index) => (
                <li key={index} className="truncate">
                  <span className="font-medium">{card.front}</span> — {card.back}
                </li>
              ))}
              {found > 5 && <li className="text-(--muted-fg)">…</li>}
            </ul>
            <SelectField
              label={tf(lang, "handoffInto")}
              value={target}
              onChange={setTarget}
              options={[{ value: NEW, label: tf(lang, "handoffNew") }, ...store.decks.map((deck) => ({ value: deck.id, label: deck.name }))]}
            />
            {target === NEW && (
              <label className={labelClass}>
                {tf(lang, "importDeckName")}
                <input className={inputClass} value={name} maxLength={MAX_NAME_LENGTH} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            {full && <p className="text-xs text-(--warning)">{tf(lang, "importDeckFull", { n: MAX_DECKS })}</p>}
          </>
        )}
        <p className="text-xs text-(--muted-fg)">{ts(lang, "receiveNote")}</p>
        <div className="flex flex-wrap gap-2">
          {found > 0 && (
            <ActionButton disabled={full} onClick={() => onConfirm({ deckId: target === NEW ? null : target, name: name.trim() || "Deck" }, parsed.cards)}>
              {tf(lang, "handoffAdd", { n: found })}
            </ActionButton>
          )}
          <ActionButton variant="secondary" onClick={onDismiss}>
            {ts(lang, "dismiss")}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
