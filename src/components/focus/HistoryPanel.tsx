import * as React from "react";

import { panelClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { metQuota, streak, totals, type DayRecord } from "@/lib/focus/history";
import { formatDay, formatMinutes, tz } from "@/lib/focus/i18n";

const SHOWN = 30;

export function HistoryPanel({ lang, history, today }: { lang: AppLang; history: readonly DayRecord[]; today: number }) {
  const sum = totals(history);
  const recent = [...history].reverse().slice(0, SHOWN);
  const stats: [string, string][] = [
    [tz(lang, "statStreak"), String(streak(history, today))],
    [tz(lang, "statFull"), String(sum.fullDays)],
    [tz(lang, "statFocused"), formatMinutes(lang, sum.focusedMin)],
    [tz(lang, "statLost"), String(sum.fired)],
  ];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="fo-history">
      <h2 id="fo-history" className="text-sm font-semibold">
        {tz(lang, "history")}
      </h2>
      {history.length === 0 ? (
        <p className="text-sm text-(--muted-fg)">{tz(lang, "historyEmpty")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className={`${panelClass} flex flex-col items-center py-3 text-center`}>
                <dd className="order-1 text-xl font-bold">{value}</dd>
                <dt className="order-2 text-xs text-(--muted-fg)">{label}</dt>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-2">
            {recent.map((record, index) => (
              <li key={`${record.day}-${index}`} className="flex flex-col gap-0.5 rounded-lg border border-(--border) bg-(--bg) px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{formatDay(lang, record.day)}</span>
                  <span className={metQuota(record) ? "text-(--success)" : "text-(--warning)"}>
                    {tz(lang, "record", { done: record.done, total: record.quota, min: record.focusedMin })}
                  </span>
                </div>
                <span className="text-xs text-(--muted-fg)">
                  {record.left.length === 0 ? tz(lang, "stayed") : tz(lang, "left", { names: record.left.join(", ") })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
