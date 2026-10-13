import * as React from "react";

import { Modal } from "@/components/apps/Modal";
import { ActionButton, panelClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { formatClock, formatMinutes, tz } from "@/lib/focus/i18n";
import type { DayOffice } from "@/lib/focus/office";
import { pomodoroStatuses, quota, remainingMs, type TimerState } from "@/lib/focus/timer";
import { cn } from "@/lib/viewer/utils";

export interface DayPanelProps {
  lang: AppLang;
  timer: TimerState;
  office: DayOffice;
  now: number;
  focusMode: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkipBreak: () => void;
  onGiveUp: () => void;
  onEndDay: () => void;
  onNewDay: () => void;
  onToggleFocusMode: () => void;
}

const DOT = "size-3.5 rounded-full border-2";

export function Dots({ lang, timer }: { lang: AppLang; timer: TimerState }) {
  const statuses = pomodoroStatuses(timer);
  const left = statuses.filter((status) => status === "current" || status === "pending").length;
  return (
    <div role="img" aria-label={tz(lang, "dots", { done: timer.done, missed: timer.missed, left })} className="flex flex-wrap justify-center gap-2">
      {statuses.map((status, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            DOT,
            status === "done" && "border-(--success) bg-(--success)",
            status === "missed" && "border-(--warning) bg-(--warning)",
            status === "current" && "border-(--accent) bg-transparent ring-2 ring-(--accent)/40",
            status === "pending" && "border-(--border) bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

export function DayPanel(props: DayPanelProps) {
  const { lang, timer, office, now, focusMode } = props;
  const [confirm, setConfirm] = React.useState<"giveUp" | "end" | null>(null);

  const total = quota(timer);
  const complete = timer.phase === "complete";
  const segment = timer.segments[timer.index];
  const running = timer.phase === "focus" || timer.phase === "break";

  // The clock shows what is left, or the length of the next segment while waiting.
  const clockMs = running ? remainingMs(timer, now) : (segment?.minutes ?? 0) * 60_000;
  const phaseLabel =
    timer.phase === "ready"
      ? tz(lang, "phaseReady")
      : timer.phase === "focus"
        ? tz(lang, "phaseFocus")
        : timer.phase === "break"
          ? tz(lang, segment?.kind === "long" ? "phaseLong" : "phaseBreak")
          : tz(lang, "phaseDone");

  // Who would go next, so the warning can name them.
  const nextToGo = office.roster.find((person) => person.id === office.fireOrder[timer.missed]);
  const unplayed = total - timer.results.length;

  if (complete) {
    const won = timer.missed === 0 && timer.done > 0;
    const names = office.fireOrder.slice(0, timer.missed).map((id) => office.roster.find((person) => person.id === id)?.name ?? "");
    return (
      <section className={cn(panelClass, "flex flex-col items-center gap-3 py-6 text-center")} aria-labelledby="fo-summary">
        <h2 id="fo-summary" className="text-xl font-semibold">
          {won ? tz(lang, "winTitle") : tz(lang, "loseTitle")}
        </h2>
        <Dots lang={lang} timer={timer} />
        <p className="max-w-md text-sm text-(--muted-fg)">
          {won
            ? tz(lang, "winBody", { n: timer.done, min: Math.round(timer.focusedMs / 60_000) })
            : tz(lang, "loseBody", { done: timer.done, total, names: names.filter(Boolean).join(", ") })}
        </p>
        <ActionButton onClick={props.onNewDay}>{tz(lang, "newDay")}</ActionButton>
      </section>
    );
  }

  return (
    <section className={cn(panelClass, "flex flex-col items-center gap-4")} aria-label={phaseLabel}>
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-(--muted-fg)">
          {phaseLabel} · {tz(lang, "progress", { n: Math.min(timer.results.length + 1, total), total })}
        </p>
        <p
          role="timer"
          aria-label={tz(lang, "timer")}
          className={cn("font-mono font-bold tabular-nums", focusMode ? "text-7xl sm:text-8xl" : "text-5xl sm:text-6xl", timer.paused && "opacity-60")}
        >
          {formatClock(clockMs)}
        </p>
        {timer.phase === "ready" && segment && <p className="text-xs text-(--muted-fg)">{formatMinutes(lang, segment.minutes)}</p>}
      </div>

      <Dots lang={lang} timer={timer} />

      <div className="flex flex-wrap justify-center gap-2">
        {timer.phase === "ready" && <ActionButton onClick={props.onStart}>{tz(lang, "start")}</ActionButton>}
        {running && !timer.paused && (
          <ActionButton variant={timer.phase === "break" ? "primary" : "secondary"} onClick={props.onPause}>
            {tz(lang, "pause")}
          </ActionButton>
        )}
        {running && timer.paused && <ActionButton onClick={props.onResume}>{tz(lang, "resume")}</ActionButton>}
        {timer.phase === "break" && (
          <ActionButton variant="secondary" onClick={props.onSkipBreak}>
            {tz(lang, "skipBreak")}
          </ActionButton>
        )}
        {timer.phase === "focus" && (
          <ActionButton variant="secondary" className="border-(--warning) text-(--warning)" onClick={() => setConfirm("giveUp")}>
            {tz(lang, "giveUp")}
          </ActionButton>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={props.onToggleFocusMode}>
          {focusMode ? tz(lang, "exitFocusMode") : tz(lang, "focusMode")}
        </ActionButton>
        <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => setConfirm("end")}>
          {tz(lang, "endDay")}
        </ActionButton>
      </div>

      <Modal open={confirm === "giveUp"} onClose={() => setConfirm(null)} label={tz(lang, "giveUpTitle")} className="lab-modal-md">
        <div className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{tz(lang, "giveUpTitle")}</h2>
          {nextToGo && <p className="text-sm">{tz(lang, "giveUpBody", { name: nextToGo.name })}</p>}
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => setConfirm(null)}>{tz(lang, "keepFocusing")}</ActionButton>
            <ActionButton
              variant="secondary"
              className="border-(--warning) text-(--warning)"
              onClick={() => {
                setConfirm(null);
                props.onGiveUp();
              }}
            >
              {tz(lang, "giveUpYes")}
            </ActionButton>
          </div>
        </div>
      </Modal>

      <Modal open={confirm === "end"} onClose={() => setConfirm(null)} label={tz(lang, "endTitle")} className="lab-modal-md">
        <div className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{tz(lang, "endTitle")}</h2>
          <p className="text-sm">{tz(lang, "endBody", { n: Math.max(0, unplayed) })}</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => setConfirm(null)}>{tz(lang, "keepFocusing")}</ActionButton>
            <ActionButton
              variant="secondary"
              className="border-(--warning) text-(--warning)"
              onClick={() => {
                setConfirm(null);
                props.onEndDay();
              }}
            >
              {tz(lang, "endYes")}
            </ActionButton>
          </div>
        </div>
      </Modal>
    </section>
  );
}
