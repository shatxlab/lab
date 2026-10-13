import * as React from "react";

import { SendToPhone } from "@/components/tools/SendToPhone";
import { ActionButton, FilePicker, inputClass, labelClass, panelClass, textareaClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import { withBase } from "@/lib/apps/paths";
import type { AppLang } from "@/lib/apps/lang";
import { tf } from "@/lib/flash/i18n";
import { MAX_CARDS_PER_DECK, deckCounts, type Card, type Deck, type FlashStore } from "@/lib/flash/model";
import { addCards, removeCard, removeDeck, renameDeck, updateCard } from "@/lib/flash/ops";
import { parseImport, toTsv } from "@/lib/flash/parse";
import { FLASH_SEND_KIND, deckToSend } from "@/lib/flash/send";

const PAGE = 100;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const splitTags = (value: string) => value.split(/[,;\s]+/).filter(Boolean);

export interface DeckViewProps {
  lang: AppLang;
  deck: Deck;
  store: FlashStore;
  day: number;
  commit: (update: (store: FlashStore) => FlashStore) => void;
  onBack: () => void;
  onStudy: (mode: "review" | "cram") => void;
}

export function DeckView({ lang, deck, store, day, commit, onBack, onStudy }: DeckViewProps) {
  const [notice, setNotice] = React.useState("");
  const counts = deckCounts(deck, store, day);
  const studyable = counts.due + counts.fresh > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={onBack}>
          ← {tf(lang, "backToDecks")}
        </ActionButton>
      </div>

      <DeckHeader lang={lang} deck={deck} store={store} day={day} commit={commit} onBack={onBack} />

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton disabled={!studyable} onClick={() => onStudy("review")}>
          {tf(lang, "study")}
        </ActionButton>
        <ActionButton variant="secondary" disabled={deck.cards.length === 0} onClick={() => onStudy("cram")}>
          {tf(lang, "cram")}
        </ActionButton>
        {!studyable && deck.cards.length > 0 && <p className="text-sm text-(--muted-fg)">{tf(lang, "nothingDue")}</p>}
      </div>

      <p className="sr-only" role="status">
        {notice}
      </p>
      <AddCard lang={lang} deck={deck} commit={commit} setNotice={setNotice} />
      <ImportPanel lang={lang} deck={deck} commit={commit} setNotice={setNotice} />
      <CardList lang={lang} deck={deck} commit={commit} />
    </div>
  );
}

/* ----------------------------------------------------------------- header */

function DeckHeader({ lang, deck, store, day, commit, onBack }: Pick<DeckViewProps, "lang" | "deck" | "store" | "day" | "commit" | "onBack">) {
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(deck.name);
  const [confirming, setConfirming] = React.useState(false);
  const counts = deckCounts(deck, store, day);

  const exportDeck = () => {
    const file = `${deck.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "deck"}.tsv`;
    saveBlob(new Blob([toTsv(deck.cards)], { type: "text/tab-separated-values;charset=utf-8" }), file);
  };

  return (
    <div className="flex flex-col gap-2">
      {renaming ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            commit((s) => renameDeck(s, deck.id, name));
            setRenaming(false);
          }}
        >
          <label className="sr-only" htmlFor="fc-rename">
            {tf(lang, "deckName")}
          </label>
          <input id="fc-rename" className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
          <ActionButton type="submit">{tf(lang, "save")}</ActionButton>
          <ActionButton variant="secondary" onClick={() => setRenaming(false)}>
            {tf(lang, "cancel")}
          </ActionButton>
        </form>
      ) : (
        <h2 className="text-xl font-semibold break-words">{deck.name}</h2>
      )}
      <p className="text-sm text-(--muted-fg)">{tf(lang, "deckMeta", { due: counts.due, fresh: counts.fresh, total: counts.total })}</p>
      <div className="flex flex-wrap gap-2">
        {!renaming && (
          <ActionButton
            variant="secondary"
            className="h-8 px-3 text-xs"
            onClick={() => {
              setName(deck.name);
              setRenaming(true);
            }}
          >
            {tf(lang, "rename")}
          </ActionButton>
        )}
        <ActionButton variant="secondary" className="h-8 px-3 text-xs" disabled={deck.cards.length === 0} onClick={exportDeck}>
          {tf(lang, "exportDeck")}
        </ActionButton>
        <SendToPhone
          lang={lang}
          kind={FLASH_SEND_KIND}
          toolPath={withBase("/flash")}
          getData={() => deckToSend(deck)}
          disabled={deck.cards.length === 0}
          className="h-8 px-3 text-xs"
        />
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2 text-sm" role="alert">
            {tf(lang, "deleteAsk", { name: deck.name, n: deck.cards.length })}
            <ActionButton
              variant="secondary"
              className="h-8 border-(--warning) px-3 text-xs text-(--warning)"
              onClick={() => {
                commit((s) => removeDeck(s, deck.id));
                onBack();
              }}
            >
              {tf(lang, "deleteYes")}
            </ActionButton>
            <ActionButton className="h-8 px-3 text-xs" onClick={() => setConfirming(false)}>
              {tf(lang, "keep")}
            </ActionButton>
          </span>
        ) : (
          <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => setConfirming(true)}>
            {tf(lang, "deleteDeck")}
          </ActionButton>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- add card */

type SetNotice = (message: string) => void;

function AddCard({ lang, deck, commit, setNotice }: { lang: AppLang; deck: Deck; commit: DeckViewProps["commit"]; setNotice: SetNotice }) {
  const [front, setFront] = React.useState("");
  const [back, setBack] = React.useState("");
  const [tags, setTags] = React.useState("");
  const frontRef = React.useRef<HTMLTextAreaElement>(null);
  const full = deck.cards.length >= MAX_CARDS_PER_DECK;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!front.trim() || !back.trim() || full) return;
    commit((s) => addCards(s, deck.id, [{ front, back, tags: splitTags(tags) }]).store);
    setFront("");
    setBack("");
    setNotice(tf(lang, "cardAdded"));
    frontRef.current?.focus();
  };

  return (
    <form className={`${panelClass} flex flex-col gap-3`} onSubmit={submit} aria-labelledby="fc-add">
      <h3 id="fc-add" className="text-sm font-semibold">
        {tf(lang, "addCard")}
      </h3>
      <label className={labelClass}>
        {tf(lang, "front")}
        <textarea ref={frontRef} className={`${textareaClass} min-h-20 font-sans`} value={front} onChange={(e) => setFront(e.target.value)} maxLength={4000} />
      </label>
      <label className={labelClass}>
        {tf(lang, "back")}
        <textarea className={`${textareaClass} min-h-20 font-sans`} value={back} onChange={(e) => setBack(e.target.value)} maxLength={4000} />
      </label>
      <label className={labelClass}>
        {tf(lang, "tags")}
        <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tf(lang, "tagsHint")} />
      </label>
      <p className="text-xs text-(--muted-fg)">{tf(lang, "markdownHint")}</p>
      <div>
        <ActionButton type="submit" disabled={!front.trim() || !back.trim() || full}>
          {tf(lang, "add")}
        </ActionButton>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- import */

function ImportPanel({ lang, deck, commit, setNotice }: { lang: AppLang; deck: Deck; commit: DeckViewProps["commit"]; setNotice: SetNotice }) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");
  const parsed = React.useMemo(() => (text.trim() === "" ? null : parseImport(text)), [text]);

  const readFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError(tf(lang, "importTooBig"));
      return;
    }
    setError("");
    setText(await file.text());
  };

  const add = () => {
    if (!parsed) return;
    const room = MAX_CARDS_PER_DECK - deck.cards.length;
    commit((s) => addCards(s, deck.id, parsed.cards).store);
    setNotice(tf(lang, "imported", { n: Math.min(parsed.cards.length, Math.max(0, room)) }));
    if (parsed.cards.length > room) setError(tf(lang, "importFull", { n: MAX_CARDS_PER_DECK }));
    else setError("");
    setText("");
  };

  return (
    <details className={panelClass}>
      <summary className="cursor-pointer text-sm font-semibold">{tf(lang, "importCards")}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-(--muted-fg)">{tf(lang, "importHint")}</p>
        <label className={labelClass}>
          {tf(lang, "importPaste")}
          <textarea className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        </label>
        <FilePicker lang={lang} accept=".csv,.tsv,.txt,.md,text/*" onFiles={(files) => void readFile(files)} prompt={tf(lang, "importPick")} compact />
        {error && (
          <p className="text-sm text-(--warning)" role="alert">
            {error}
          </p>
        )}
        {parsed && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{tf(lang, "importFound", { n: parsed.cards.length })}</span>
            {parsed.skipped > 0 && <span className="text-(--muted-fg)">{tf(lang, "importSkipped", { n: parsed.skipped })}</span>}
            <ActionButton disabled={parsed.cards.length === 0} onClick={add}>
              {tf(lang, "importAdd", { n: parsed.cards.length })}
            </ActionButton>
          </div>
        )}
      </div>
    </details>
  );
}

/* -------------------------------------------------------------- card list */

function CardList({ lang, deck, commit }: { lang: AppLang; deck: Deck; commit: DeckViewProps["commit"] }) {
  const [filter, setFilter] = React.useState("");
  const [shown, setShown] = React.useState(PAGE);
  const [editing, setEditing] = React.useState<string | null>(null);

  const needle = filter.trim().toLowerCase();
  const matches = React.useMemo(
    () => (needle ? deck.cards.filter((card) => `${card.front}\n${card.back}\n${card.tags.join(" ")}`.toLowerCase().includes(needle)) : deck.cards),
    [deck.cards, needle],
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby="fc-cards">
      <h3 id="fc-cards" className="text-sm font-semibold">
        {tf(lang, "cards")} ({deck.cards.length})
      </h3>
      {deck.cards.length === 0 ? (
        <p className="text-sm text-(--muted-fg)">{tf(lang, "noCards")}</p>
      ) : (
        <>
          <input
            className={inputClass}
            aria-label={tf(lang, "filter")}
            placeholder={tf(lang, "filter")}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setShown(PAGE);
            }}
          />
          <ul className="flex flex-col gap-2">
            {matches.slice(0, shown).map((card) =>
              editing === card.id ? (
                <li key={card.id}>
                  <EditRow
                    lang={lang}
                    card={card}
                    onSave={(draft) => {
                      commit((s) => updateCard(s, deck.id, card.id, draft));
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <li key={card.id} className="flex items-start gap-3 rounded-lg border border-(--border) bg-(--bg) px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-medium">{card.front}</p>
                    <p className="line-clamp-2 break-words text-sm text-(--muted-fg)">{card.back}</p>
                    {card.tags.length > 0 && <p className="mt-1 text-xs text-(--muted-fg)">{card.tags.map((tag) => `#${tag}`).join(" ")}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <ActionButton
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      aria-label={tf(lang, "editCard", { name: card.front.slice(0, 30) })}
                      onClick={() => setEditing(card.id)}
                    >
                      {tf(lang, "edit")}
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      aria-label={tf(lang, "remove", { name: card.front.slice(0, 30) })}
                      onClick={() => commit((s) => removeCard(s, deck.id, card.id))}
                    >
                      ×
                    </ActionButton>
                  </div>
                </li>
              ),
            )}
          </ul>
          {matches.length > shown && (
            <div>
              <ActionButton variant="secondary" onClick={() => setShown(shown + PAGE)}>
                {tf(lang, "showMore")}
              </ActionButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EditRow({ lang, card, onSave, onCancel }: { lang: AppLang; card: Card; onSave: (draft: { front: string; back: string; tags: string[] }) => void; onCancel: () => void }) {
  const [front, setFront] = React.useState(card.front);
  const [back, setBack] = React.useState(card.back);
  const [tags, setTags] = React.useState(card.tags.join(" "));
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-(--accent) bg-(--bg) p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ front, back, tags: splitTags(tags) });
      }}
    >
      <label className={labelClass}>
        {tf(lang, "front")}
        <textarea className={`${textareaClass} min-h-16 font-sans`} value={front} onChange={(e) => setFront(e.target.value)} maxLength={4000} autoFocus />
      </label>
      <label className={labelClass}>
        {tf(lang, "back")}
        <textarea className={`${textareaClass} min-h-16 font-sans`} value={back} onChange={(e) => setBack(e.target.value)} maxLength={4000} />
      </label>
      <label className={labelClass}>
        {tf(lang, "tags")}
        <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <ActionButton type="submit" disabled={!front.trim() || !back.trim()}>
          {tf(lang, "save")}
        </ActionButton>
        <ActionButton variant="secondary" onClick={onCancel}>
          {tf(lang, "cancel")}
        </ActionButton>
      </div>
    </form>
  );
}
