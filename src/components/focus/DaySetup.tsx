import * as React from "react";

import { ActionButton, inputClass, labelClass, panelClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { formatMinutes, tz } from "@/lib/focus/i18n";
import { LIMITS, normalizePlan, planDay, quotaOf, totalMinutes, type Plan } from "@/lib/focus/pomodoro";

export interface DaySetupProps {
  lang: AppLang;
  plan: Plan;
  sound: boolean;
  onOpen: (plan: Plan) => void;
  onSound: (on: boolean) => void;
}

const FIELDS = [
  ["focusMin", "focusMin"],
  ["shortMin", "shortMin"],
  ["longMin", "longMin"],
  ["longEvery", "longEvery"],
] as const;

export function DaySetup({ lang, plan: saved, sound, onOpen, onSound }: DaySetupProps) {
  const [plan, setPlan] = React.useState<Plan>(saved);
  const segments = React.useMemo(() => planDay(normalizePlan(plan)), [plan]);
  const quota = quotaOf(segments);

  return (
    <form
      className={`${panelClass} flex flex-col gap-4`}
      aria-labelledby="fo-plan"
      onSubmit={(event) => {
        event.preventDefault();
        if (quota > 0) onOpen(normalizePlan(plan));
      }}
    >
      <h2 id="fo-plan" className="text-lg font-semibold">
        {tz(lang, "planTitle")}
      </h2>

      <label className={labelClass}>
        <span className="flex items-baseline justify-between">
          {tz(lang, "hours")}
          <span className="text-sm font-normal text-(--muted-fg)">{formatMinutes(lang, plan.hours * 60)}</span>
        </span>
        <input
          type="range"
          min={LIMITS.hours[0]}
          max={LIMITS.hours[1]}
          step={0.5}
          value={plan.hours}
          onChange={(event) => setPlan({ ...plan, hours: Number(event.target.value) })}
          className="w-full accent-(--accent)"
        />
      </label>

      <p className="text-sm" role="status">
        {quota > 0 ? tz(lang, "planSummary", { n: quota, time: formatMinutes(lang, totalMinutes(segments)) }) : tz(lang, "planNone")}
      </p>

      <details>
        <summary className="cursor-pointer text-sm font-medium">{tz(lang, "custom")}</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {FIELDS.map(([field, label]) => (
            <label key={field} className={labelClass}>
              {tz(lang, label)}
              <input
                type="number"
                className={inputClass}
                min={LIMITS[field][0]}
                max={LIMITS[field][1]}
                value={plan[field]}
                onChange={(event) => setPlan({ ...plan, [field]: Number(event.target.value) })}
                onBlur={() => setPlan(normalizePlan(plan))}
              />
            </label>
          ))}
        </div>
      </details>

      <p className="text-sm text-(--muted-fg)">{tz(lang, "stakes")}</p>

      <div className="flex flex-wrap items-center gap-4">
        <ActionButton type="submit" disabled={quota === 0}>
          {tz(lang, "open")}
        </ActionButton>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sound} onChange={(event) => onSound(event.target.checked)} />
          {tz(lang, "sound")}
        </label>
      </div>
    </form>
  );
}
