/** Axis math: round tick values, calendar-aligned date ticks, and number formatting in the reader's language. */

import type { AppLang } from "@/lib/apps/lang";

export interface Axis {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** 1, 2, 5 or 10 times a power of ten: the nearest "round" step at or above `raw`'s neighbourhood. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return nice * base;
}

/** Strip the float noise that `0.1 * 3` leaves behind. */
const clean = (value: number, step: number): number => {
  const digits = step >= 1 ? 0 : Math.min(10, Math.ceil(-Math.log10(step)) + 1);
  return Number(value.toFixed(digits));
};

export interface AxisOptions {
  /** Widen the range to include zero (bars, areas, histograms always do). */
  includeZero?: boolean;
  /** Roughly how many ticks to aim for. */
  count?: number;
}

/** A value axis over [min, max] that starts and ends on round numbers. */
export function niceAxis(rawMin: number, rawMax: number, options: AxisOptions = {}): Axis {
  const count = options.count ?? 5;
  let min = rawMin;
  let max = rawMax;
  if (options.includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    // A flat series: give it a range to sit in.
    if (min === 0) max = 1;
    else {
      const pad = Math.abs(min) * 0.1 || 1;
      min -= pad;
      max += pad;
    }
  }
  const step = niceStep((max - min) / count);
  const start = clean(Math.floor(min / step + 1e-9) * step, step);
  const end = clean(Math.ceil(max / step - 1e-9) * step, step);
  const ticks: number[] = [];
  for (let i = 0; start + i * step <= end + step / 1e6; i += 1) ticks.push(clean(start + i * step, step));
  return { min: start, max: end, step, ticks };
}

/* ------------------------------------------------------------------ dates */

const DAY = 86_400_000;
export type TimeUnit = "day" | "month" | "year";

interface TimeStep {
  unit: TimeUnit;
  every: number;
}

const TIME_STEPS: TimeStep[] = [
  { unit: "day", every: 1 },
  { unit: "day", every: 2 },
  { unit: "day", every: 7 },
  { unit: "day", every: 14 },
  { unit: "month", every: 1 },
  { unit: "month", every: 3 },
  { unit: "month", every: 6 },
  { unit: "year", every: 1 },
  { unit: "year", every: 2 },
  { unit: "year", every: 5 },
  { unit: "year", every: 10 },
  { unit: "year", every: 20 },
  { unit: "year", every: 50 },
  { unit: "year", every: 100 },
];

const approxSpan = (step: TimeStep): number => step.every * (step.unit === "day" ? DAY : step.unit === "month" ? 30.44 * DAY : 365.25 * DAY);

export interface TimeAxis {
  ticks: number[];
  unit: TimeUnit;
  every: number;
}

/** Calendar-aligned ticks (first of the month, January 1st, Mondays-ish for weeks) between two UTC timestamps. */
export function timeTicks(min: number, max: number, count = 6): TimeAxis {
  const span = Math.max(max - min, DAY);
  const wanted = span / Math.max(1, count);
  const step = TIME_STEPS.find((candidate) => approxSpan(candidate) >= wanted) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
  const ticks: number[] = [];
  if (step.unit === "day") {
    const size = step.every * DAY;
    for (let t = Math.ceil(min / size) * size; t <= max; t += size) ticks.push(t);
  } else if (step.unit === "month") {
    const first = new Date(min);
    let year = first.getUTCFullYear();
    let month = first.getUTCMonth();
    // Align to a multiple of `every` months from January.
    month = Math.ceil(month / step.every) * step.every;
    for (;;) {
      const t = Date.UTC(year + Math.floor(month / 12), month % 12, 1);
      if (t > max) break;
      if (t >= min) ticks.push(t);
      month += step.every;
      if (ticks.length > 400) break;
    }
  } else {
    let year = Math.ceil(new Date(min).getUTCFullYear() / step.every) * step.every;
    for (; ticks.length <= 400; year += step.every) {
      const t = Date.UTC(year, 0, 1);
      if (t > max) break;
      if (t >= min) ticks.push(t);
    }
  }
  return { ticks, unit: step.unit, every: step.every };
}

const locale = (lang: AppLang): string => (lang === "ru" ? "ru-RU" : "en-GB");

/** A short label for a date tick; the year is shown only when the axis crosses years (or the step is yearly). */
export function formatTick(ms: number, axis: TimeAxis, lang: AppLang, spansYears: boolean): string {
  const options: Intl.DateTimeFormatOptions =
    axis.unit === "year"
      ? { year: "numeric" }
      : axis.unit === "month"
        ? spansYears
          ? { month: "short", year: "numeric" }
          : { month: "short" }
        : spansYears
          ? { day: "numeric", month: "short", year: "numeric" }
          : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat(locale(lang), { ...options, timeZone: "UTC" }).format(ms);
}

/** The full date, for tooltips and tables. */
export function formatDate(ms: number, lang: AppLang): string {
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(ms);
}

/* ---------------------------------------------------------------- numbers */

const numberLocale = (lang: AppLang): string => (lang === "ru" ? "ru-RU" : "en-US");

/** A tick label: grouped digits, as many decimals as the step needs, and a compact form for big values. */
export function formatTickNumber(value: number, step: number, lang: AppLang): string {
  if (Math.abs(value) >= 10_000) return new Intl.NumberFormat(numberLocale(lang), { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
  return new Intl.NumberFormat(numberLocale(lang), { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
}

/** A value for a tooltip, label or table: grouped digits, up to two decimals (more for tiny numbers). */
export function formatValue(value: number, lang: AppLang): string {
  const abs = Math.abs(value);
  const digits = abs !== 0 && abs < 0.01 ? 6 : abs < 1 ? 3 : 2;
  return new Intl.NumberFormat(numberLocale(lang), { maximumFractionDigits: digits }).format(value);
}

/** A short value for a label that has to fit a small space: 12.9K, 4.2M. */
export function formatCompact(value: number, lang: AppLang): string {
  return new Intl.NumberFormat(numberLocale(lang), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
