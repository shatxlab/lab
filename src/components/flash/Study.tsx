import * as React from "react";

import { CardText } from "@/components/flash/CardText";
import { ActionButton, panelClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import type { Grade } from "@/lib/flash/fsrs";
import { tf } from "@/lib/flash/i18n";
import { previewIntervals, type Deck } from "@/lib/flash/model";
import type { FlashSoundEngine } from "@/lib/flash/sound";

/** How many cards later a failed card comes back in the same session. */
const REQUEUE_GAP = 3;

export interface StudyProps {
  lang: AppLang;
  deck: Deck;
  mode: "review" | "cram";
  day: number;
  retention: number;
  /** Card ids in the order they are shown. */
  initialQueue: readonly string[];
  sound: FlashSoundEngine;
  /** Called once per card, on its first answer in a review session. */
  onGrade: (cardId: string, grade: Grade) => void;
  onExit: () => void;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable]"));

export function Study({ lang, deck, mode, day, retention, initialQueue, sound, onGrade, onExit }: StudyProps) {
  const [queue, setQueue] = React.useState<readonly string[]>(initialQueue);
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [answered, setAnswered] = React.useState(0);
  const seen = React.useRef(new Set<string>());
  const showRef = React.useRef<HTMLButtonElement>(null);
  const defaultRef = React.useRef<HTMLButtonElement>(null);

  const cardId = queue[index];
  const card = cardId ? deck.cards.find((item) => item.id === cardId) : undefined;
  const finished = !card;
  // Four grades on a card's first answer in a review session; otherwise pass/fail.
  const full = mode === "review" && card !== undefined && !seen.current.has(card.id);
  const intervals = React.useMemo(() => (card && full ? previewIntervals(card, day, retention) : null), [card, full, day, retention]);

  React.useEffect(() => {
    if (finished) sound.play("done");
  }, [finished, sound]);

  // Focus follows the flow: "Show answer" for each new card, the default grade once flipped.
  React.useEffect(() => {
    if (!flipped) showRef.current?.focus();
  }, [index, flipped]);
  React.useEffect(() => {
    if (flipped) defaultRef.current?.focus();
  }, [flipped]);

  const flip = () => {
    sound.play("flip");
    setFlipped(true);
  };

  const answer = (grade: Grade) => {
    if (!card) return;
    const first = !seen.current.has(card.id);
    if (first) {
      seen.current.add(card.id);
      if (mode === "review") onGrade(card.id, grade);
      setAnswered((count) => count + 1);
    }
    if (grade === 1) {
      const at = Math.min(index + 1 + REQUEUE_GAP, queue.length);
      setQueue([...queue.slice(0, at), card.id, ...queue.slice(at)]);
    }
    sound.play(grade === 1 ? "again" : "good");
    setIndex(index + 1);
    setFlipped(false);
  };

  const answerRef = React.useRef(answer);
  answerRef.current = answer;
  const flipRef = React.useRef(flip);
  flipRef.current = flip;

  React.useEffect(() => {
    if (finished) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (!flipped) {
        // A focused button handles Space/Enter itself; this covers focus elsewhere.
        if ((event.key === " " || event.key === "Enter") && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault();
          flipRef.current();
        }
        return;
      }
      const grade = Number(event.key);
      if (full && grade >= 1 && grade <= 4) answerRef.current(grade as Grade);
      else if (!full && (grade === 1 || grade === 2)) answerRef.current(grade === 1 ? 1 : 3);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, flipped, full]);

  if (finished) {
    return (
      <section className={`${panelClass} flex flex-col items-center gap-3 py-10 text-center`} aria-labelledby="fc-done">
        <h2 id="fc-done" className="text-xl font-semibold">
          {tf(lang, "doneTitle")}
        </h2>
        <p className="text-sm text-(--muted-fg)">{answered > 0 ? tf(lang, "doneBody", { n: answered }) : tf(lang, "doneEmpty")}</p>
        <ActionButton onClick={onExit}>{tf(lang, "done")}</ActionButton>
      </section>
    );
  }

  const gradeLabel = (grade: Grade, key: "again" | "hard" | "good" | "easy") => (
    <>
      <span>{tf(lang, key)}</span>
      {intervals && <span className="text-xs opacity-80">{tf(lang, "days", { n: intervals[grade] })}</span>}
    </>
  );
  const gradeClass = "h-auto min-h-12 flex-col gap-0 py-2";

  return (
    <section className="flex flex-col gap-4" aria-label={deck.name}>
      <div className="flex items-center justify-between gap-3 text-sm text-(--muted-fg)">
        <span aria-live="polite">{tf(lang, "progress", { n: Math.min(index + 1, queue.length), total: queue.length })}</span>
        <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={onExit}>
          {tf(lang, "endSession")}
        </ActionButton>
      </div>
      {mode === "cram" && <p className="text-xs text-(--muted-fg)">{tf(lang, "cramNote")}</p>}

      <div className={`${panelClass} flex min-h-56 flex-col gap-4`}>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-(--muted-fg)">{tf(lang, "question")}</p>
          <CardText text={card.front} className="text-lg" />
        </div>
        {flipped && (
          <div className="border-t border-(--border) pt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-(--muted-fg)">{tf(lang, "answer")}</p>
            <CardText text={card.back} className="text-lg" />
          </div>
        )}
      </div>

      {!flipped ? (
        <ActionButton ref={showRef} className="h-12" onClick={flip}>
          {tf(lang, "showAnswer")}
        </ActionButton>
      ) : full ? (
        <div className="grid grid-cols-4 gap-2">
          <ActionButton variant="secondary" className={gradeClass} onClick={() => answer(1)}>
            {gradeLabel(1, "again")}
          </ActionButton>
          <ActionButton variant="secondary" className={gradeClass} onClick={() => answer(2)}>
            {gradeLabel(2, "hard")}
          </ActionButton>
          <ActionButton ref={defaultRef} className={gradeClass} onClick={() => answer(3)}>
            {gradeLabel(3, "good")}
          </ActionButton>
          <ActionButton variant="secondary" className={gradeClass} onClick={() => answer(4)}>
            {gradeLabel(4, "easy")}
          </ActionButton>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ActionButton variant="secondary" className="h-12" onClick={() => answer(1)}>
            {tf(lang, mode === "cram" ? "missed" : "again")}
          </ActionButton>
          <ActionButton ref={defaultRef} className="h-12" onClick={() => answer(3)}>
            {tf(lang, "gotIt")}
          </ActionButton>
        </div>
      )}
    </section>
  );
}
