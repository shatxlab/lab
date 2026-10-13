import * as React from "react";

import { DeckList } from "@/components/flash/DeckList";
import { DeckView } from "@/components/flash/DeckView";
import { Study } from "@/components/flash/Study";
import { ToolPage } from "@/components/tools/ui";
import { useAppLang } from "@/lib/apps/use-app-lang";
import type { Grade } from "@/lib/flash/fsrs";
import { tf } from "@/lib/flash/i18n";
import { cramQueue, emptyStore, localDay, recordReview, studyQueue, type FlashStore } from "@/lib/flash/model";
import { createFlashSoundEngine, type FlashSoundEngine } from "@/lib/flash/sound";
import { readFlashStore, writeFlashStore } from "@/lib/flash/storage";

type View =
  | { kind: "decks" }
  | { kind: "deck"; id: string }
  | { kind: "study"; id: string; mode: "review" | "cram"; day: number; queue: string[] };

export default function FlashApp() {
  const lang = useAppLang();
  const [store, setStore] = React.useState<FlashStore>(emptyStore);
  const storeRef = React.useRef(store);
  const [hydrated, setHydrated] = React.useState(false);
  const [view, setView] = React.useState<View>({ kind: "decks" });

  const soundRef = React.useRef<FlashSoundEngine | null>(null);
  soundRef.current ??= createFlashSoundEngine(true);
  const sound = soundRef.current;

  React.useEffect(() => {
    const loaded = readFlashStore();
    storeRef.current = loaded;
    setStore(loaded);
    setHydrated(true);
  }, []);

  React.useEffect(() => sound.setEnabled(store.settings.sound), [sound, store.settings.sound]);

  const commit = React.useCallback((update: (current: FlashStore) => FlashStore) => {
    const next = update(storeRef.current);
    if (next === storeRef.current) return;
    storeRef.current = next;
    setStore(next);
    writeFlashStore(next);
  }, []);

  const day = localDay();
  const deck = view.kind === "decks" ? undefined : store.decks.find((item) => item.id === view.id);

  const startStudy = (id: string, mode: "review" | "cram") => {
    const target = store.decks.find((item) => item.id === id);
    if (!target) return;
    const today = localDay();
    const cards = mode === "cram" ? cramQueue(target) : studyQueue(target, store, today);
    setView({ kind: "study", id, mode, day: today, queue: cards.map((card) => card.id) });
  };

  const grade = (cardId: string, value: Grade) => {
    if (view.kind !== "study") return;
    commit((current) => recordReview(current, view.id, cardId, value, view.day));
  };

  let body: React.ReactNode = null;
  if (hydrated) {
    if (!deck || view.kind === "decks") {
      body = <DeckList lang={lang} store={store} day={day} commit={commit} onOpen={(id) => setView({ kind: "deck", id })} onStudy={(id) => startStudy(id, "review")} />;
    } else if (view.kind === "deck") {
      body = (
        <DeckView
          lang={lang}
          deck={deck}
          store={store}
          day={day}
          commit={commit}
          onBack={() => setView({ kind: "decks" })}
          onStudy={(mode) => startStudy(deck.id, mode)}
        />
      );
    } else {
      body = (
        <Study
          lang={lang}
          deck={deck}
          mode={view.mode}
          day={view.day}
          retention={store.settings.retention}
          initialQueue={view.queue}
          sound={sound}
          onGrade={grade}
          onExit={() => setView({ kind: "deck", id: deck.id })}
        />
      );
    }
  }

  return (
    <ToolPage title={tf(lang, "title")} tagline={tf(lang, "tagline")}>
      {body}
    </ToolPage>
  );
}
