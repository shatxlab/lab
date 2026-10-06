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

// Pure derivation; building the four boards once avoids doing it on re-render.
const BUILT = CROSSWORD_PUZZLES.map(buildPuzzle);

export default function CrosswordGame() {
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
      const index = BUILT.findIndex((item) => item.puzzle.id === current);
      const next = BUILT[(index + 1) % BUILT.length];
      return next?.puzzle.id ?? current;
    });
  }, []);

  const items: PickerItem[] = useMemo(
    () => BUILT.map((built) => ({ puzzle: built.puzzle, built, progress: store[built.puzzle.id] })),
    [store],
  );

  const active = activeId ? BUILT.find((item) => item.puzzle.id === activeId) ?? null : null;

  return (
    <div className="cw-shell">
      {active ? (
        <Board
          key={active.puzzle.id}
          built={active}
          saved={storeRef.current[active.puzzle.id]}
          hasNext={BUILT.length > 1}
          sound={sound}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((value) => !value)}
          onPersist={persist}
          onBack={backToList}
          onNext={nextPuzzle}
        />
      ) : (
        <PuzzlePicker items={items} onOpen={openPuzzle} />
      )}
    </div>
  );
}
