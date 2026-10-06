import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Board } from "./Board";
import { PuzzlePicker, type PickerItem } from "./PuzzlePicker";
import { buildPuzzle } from "@/lib/crossword/grid";
import { CROSSWORD_PUZZLES } from "@/lib/crossword/puzzles";
import { createCrosswordSoundEngine, type CrosswordSoundEngine } from "@/lib/crossword/sound";
import {
  readCrosswordState,
  withPuzzleProgress,
  writeCrosswordState,
  type StoredCrosswordState,
  type StoredPuzzleProgress,
} from "@/lib/crossword/storage";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";

// Pure derivation; building the boards once avoids doing it on re-render.
const BUILT = {
  en: CROSSWORD_PUZZLES.en.map(buildPuzzle),
  ru: CROSSWORD_PUZZLES.ru.map(buildPuzzle),
};

export default function CrosswordGame() {
  // The shared header language setting drives which puzzles and strings show.
  const lang = useAppLang();
  const readyRef = useLangReady<HTMLDivElement>();
  const [store, setStore] = useState<StoredCrosswordState>({});
  const storeRef = useRef<StoredCrosswordState>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  const soundRef = useRef<CrosswordSoundEngine | null>(null);
  const sound = soundRef.current ?? (soundRef.current = createCrosswordSoundEngine(true));

  useEffect(() => {
    const saved = readCrosswordState();
    storeRef.current = saved;
    setStore(saved);
  }, []);

  useEffect(() => {
    soundRef.current?.setEnabled(soundOn);
  }, [soundOn]);

  const persist = useCallback((id: string, progress: StoredPuzzleProgress) => {
    storeRef.current = withPuzzleProgress(storeRef.current, id, progress);
    writeCrosswordState(storeRef.current);
  }, []);

  const openPuzzle = useCallback((id: string) => {
    soundRef.current?.resume();
    setActiveId(id);
  }, []);

  const backToList = useCallback(() => {
    setStore({ ...storeRef.current });
    setActiveId(null);
  }, []);

  const nextPuzzle = useCallback(() => {
    setStore({ ...storeRef.current });
    setActiveId((current) => {
      if (!current) return current;
      const list = BUILT[lang];
      const index = list.findIndex((item) => item.puzzle.id === current);
      const next = list[(index + 1) % list.length];
      return next?.puzzle.id ?? current;
    });
  }, [lang]);

  const items: PickerItem[] = useMemo(
    () =>
      BUILT[lang].map((built) => ({
        puzzle: built.puzzle,
        built,
        progress: store[built.puzzle.id],
      })),
    [store, lang],
  );

  const active = activeId
    ? BUILT[lang].find((item) => item.puzzle.id === activeId) ?? null
    : null;

  return (
    <div ref={readyRef} data-lang-sensitive="" className="cw-shell">
      {active ? (
        <Board
          key={active.puzzle.id}
          built={active}
          lang={lang}
          saved={storeRef.current[active.puzzle.id]}
          hasNext={BUILT[lang].length > 1}
          sound={sound}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((value) => !value)}
          onPersist={persist}
          onBack={backToList}
          onNext={nextPuzzle}
        />
      ) : (
        <PuzzlePicker items={items} lang={lang} onOpen={openPuzzle} />
      )}
    </div>
  );
}
