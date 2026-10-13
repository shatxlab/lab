import * as React from "react";

import { Modal } from "@/components/apps/Modal";
import { ActionButton, panelClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { cycleDots, cycleResults, remainingMs, segmentMinutes, type FlowState } from "@/lib/focus/flow";
import { formatClock, tz } from "@/lib/focus/i18n";
import type { Office } from "@/lib/focus/office";
import { cn } from "@/lib/viewer/utils";

export interface FlowPanelProps {
  lang: AppLang;
  flow: FlowState;
  office: Office;
  now: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkipBreak: () => void;
  onGiveUp: () => void;
  onHire: () => void;
}

const DOT = "size-3.5 rounded-full border-2";

export function Dots({ lang, flow }: { lang: AppLang; flow: FlowState }) {
  const dots = cycleDots(flow);
  const round = cycleResults(flow);
  return (
    <div
      role="img"
      aria-label={tz(lang, "dots", { done: round.filter((r) => r === "done").length, missed: round.filter((r) => r === "missed").length })}
      className="flex flex-wrap justify-center gap-2"
    >
      {dots.map((status, index) => (
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

export function FlowPanel(props: FlowPanelProps) {
  const { lang, flow, office, now } = props;
  const [confirming, setConfirming] = React.useState(false);
  const running = flow.phase === "focus" || flow.phase === "break";

  if (flow.phase === "empty") {
    return (
      <section className={cn(panelClass, "flex flex-col items-center gap-3 py-6 text-center")} aria-labelledby="fo-empty">
        <h2 id="fo-empty" className="text-xl font-semibold">
          {tz(lang, "emptyTitle")}
        </h2>
        <p className="max-w-md text-sm text-(--muted-fg)">{tz(lang, "emptyBody", { n: flow.done, min: Math.round(flow.focusedMs / 60_000) })}</p>
        <ActionButton onClick={props.onHire}>{tz(lang, "hire")}</ActionButton>
      </section>
    );
  }

  const clockMs = running ? remainingMs(flow, now) : segmentMinutes(flow) * 60_000;
  const phaseLabel =
    flow.phase === "ready" ? tz(lang, "phaseReady") : flow.phase === "focus" ? tz(lang, "phaseFocus") : tz(lang, flow.long ? "phaseLong" : "phaseBreak");
  // Who would go next, so the warning can name them.
  const nextToGo = office.roster.find((person) => person.id === office.fireOrder[flow.missed]);

  return (
    <section className={cn(panelClass, "flex flex-col items-center gap-3")} aria-label={phaseLabel}>
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-(--muted-fg)">{phaseLabel}</p>
        <p role="timer" aria-label={tz(lang, "timer")} className={cn("font-mono text-6xl font-bold tabular-nums sm:text-7xl", flow.paused && "opacity-60")}>
          {formatClock(clockMs)}
        </p>
        {flow.phase === "ready" && <p className="text-center text-xs text-(--muted-fg)">{tz(lang, "flowNote")}</p>}
      </div>

      <Dots lang={lang} flow={flow} />
      <p className="text-xs text-(--muted-fg)">{tz(lang, "doneCount", { n: flow.done })}</p>

      <div className="flex flex-wrap justify-center gap-2">
        {flow.phase === "ready" && <ActionButton onClick={props.onStart}>{tz(lang, "start")}</ActionButton>}
        {running && !flow.paused && (
          <ActionButton variant={flow.phase === "break" ? "primary" : "secondary"} onClick={props.onPause}>
            {tz(lang, "pause")}
          </ActionButton>
        )}
        {running && flow.paused && <ActionButton onClick={props.onResume}>{tz(lang, "resume")}</ActionButton>}
        {flow.phase === "break" && (
          <ActionButton variant="secondary" onClick={props.onSkipBreak}>
            {tz(lang, "skipBreak")}
          </ActionButton>
        )}
        {flow.phase === "focus" && (
          <ActionButton variant="secondary" className="border-(--warning) text-(--warning)" onClick={() => setConfirming(true)}>
            {tz(lang, "giveUp")}
          </ActionButton>
        )}
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} label={tz(lang, "giveUpTitle")} className="lab-modal-md">
        <div className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{tz(lang, "giveUpTitle")}</h2>
          {nextToGo && <p className="text-sm">{tz(lang, "giveUpBody", { name: nextToGo.name })}</p>}
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => setConfirming(false)}>{tz(lang, "keepFocusing")}</ActionButton>
            <ActionButton
              variant="secondary"
              className="border-(--warning) text-(--warning)"
              onClick={() => {
                setConfirming(false);
                props.onGiveUp();
              }}
            >
              {tz(lang, "giveUpYes")}
            </ActionButton>
          </div>
        </div>
      </Modal>
    </section>
  );
}
