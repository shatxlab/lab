import * as React from "react";

import { ActionButton, inputClass, labelClass, panelClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { tf } from "@/lib/flash/i18n";
import { MAX_DECKS, deckCounts, summarize, type FlashSettings, type FlashStore } from "@/lib/flash/model";
import { addDeck } from "@/lib/flash/ops";

export interface DeckListProps {
  lang: AppLang;
  store: FlashStore;
  day: number;
  commit: (update: (store: FlashStore) => FlashStore) => void;
  onOpen: (deckId: string) => void;
  onStudy: (deckId: string) => void;
}

export function DeckList({ lang, store, day, commit, onOpen, onStudy }: DeckListProps) {
  const summary = summarize(store, day);
  const [name, setName] = React.useState("");
  const full = store.decks.length >= MAX_DECKS;

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || full) return;
    let created = "";
    commit((s) => {
      const result = addDeck(s, name);
      created = result.deck?.id ?? "";
      return result.store;
    });
    setName("");
    if (created) onOpen(created);
  };

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            ["statDue", summary.due],
            ["statStreak", summary.streak],
            ["statLearned", summary.learned],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className={`${panelClass} flex flex-col items-center py-3 text-center`}>
            <dd className="order-1 text-2xl font-bold">{value}</dd>
            <dt className="order-2 text-xs text-(--muted-fg)">{tf(lang, key)}</dt>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2" aria-labelledby="fc-decks">
        <h2 id="fc-decks" className="text-sm font-semibold">
          {tf(lang, "decks")}
        </h2>
        {store.decks.length === 0 ? (
          <p className="text-sm text-(--muted-fg)">{tf(lang, "noDecks")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {store.decks.map((deck) => {
              const counts = deckCounts(deck, store, day);
              const ready = counts.due + counts.fresh > 0;
              return (
                <li key={deck.id} className={`${panelClass} flex items-center gap-3 py-3`}>
                  <button
                    type="button"
                    onClick={() => onOpen(deck.id)}
                    className="flex min-w-0 flex-1 flex-col rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                  >
                    <span className="truncate font-medium">{deck.name}</span>
                    <span className="text-xs text-(--muted-fg)">
                      {tf(lang, "deckMeta", { due: counts.due, fresh: counts.fresh, total: counts.total })}
                    </span>
                  </button>
                  {ready && (
                    <ActionButton aria-label={`${tf(lang, "study")}: ${deck.name}`} onClick={() => onStudy(deck.id)}>
                      {tf(lang, "study")}
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form className={`${panelClass} flex flex-col gap-2`} onSubmit={create} aria-labelledby="fc-new">
        <h2 id="fc-new" className="text-sm font-semibold">
          {tf(lang, "newDeck")}
        </h2>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="fc-new-name">
            {tf(lang, "deckName")}
          </label>
          <input id="fc-new-name" className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={tf(lang, "deckName")} disabled={full} />
          <ActionButton type="submit" className="shrink-0 whitespace-nowrap" disabled={!name.trim() || full}>
            {tf(lang, "create")}
          </ActionButton>
        </div>
        {full && <p className="text-xs text-(--muted-fg)">{tf(lang, "deckLimit", { n: MAX_DECKS })}</p>}
      </form>

      <SettingsPanel lang={lang} settings={store.settings} commit={commit} />
    </div>
  );
}

function SettingsPanel({ lang, settings, commit }: { lang: AppLang; settings: FlashSettings; commit: DeckListProps["commit"] }) {
  const change = (patch: Partial<FlashSettings>) => commit((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  return (
    <details className={panelClass}>
      <summary className="cursor-pointer text-sm font-semibold">{tf(lang, "settings")}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <label className={labelClass}>
          {tf(lang, "newPerDay")}
          <input
            type="number"
            min={0}
            max={500}
            className={inputClass}
            value={settings.newPerDay}
            onChange={(e) => change({ newPerDay: Math.min(500, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
          />
        </label>
        <label className={labelClass}>
          {tf(lang, "retention")}
          <select className={inputClass} value={settings.retention} onChange={(e) => change({ retention: Number(e.target.value) })}>
            {[0.8, 0.85, 0.9, 0.95].map((value) => (
              <option key={value} value={value}>
                {Math.round(value * 100)}%
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-(--muted-fg)">{tf(lang, "retentionHint")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={settings.sound} onChange={(e) => change({ sound: e.target.checked })} />
          {tf(lang, "sound")}
        </label>
      </div>
    </details>
  );
}
