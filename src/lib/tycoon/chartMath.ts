import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'

/** A step of 1, 2 or 5 times a power of ten that splits `range` into about `target` parts. */
export function niceStep(range: number, target: number): number {
  if (range <= 0) return 1
  const rough = range / target
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * power
}

/** Clean axis ticks that cover [min, max]; the domain is widened to the first and last tick. */
export function niceTicks(min: number, max: number, target = 4): { ticks: number[]; lo: number; hi: number } {
  const step = niceStep(max - min, target)
  let lo = Math.floor(min / step) * step
  let hi = Math.ceil(max / step) * step
  if (lo === hi) hi = lo + step
  const ticks: number[] = []
  for (let value = lo; value <= hi + step / 2; value += step) ticks.push(Math.round(value * 1e6) / 1e6)
  return { ticks, lo, hi }
}

/** Short money for axis ticks and end labels: $0, $500, $1.5k, $50k, $1.2M, -$2k. */
export function compactMoney(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const trim = (n: number) => String(Math.round(n * 10) / 10)
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}k`
  return `${sign}$${Math.round(abs)}`
}

/** Month-boundary days to label on the x axis, at most `maxCount` of them, evenly stepped in whole months. */
export function monthTicks(firstDay: number, lastDay: number, maxCount = 5): number[] {
  const firstMonth = Math.ceil(firstDay / DAYS_PER_MONTH)
  const lastMonth = Math.floor(lastDay / DAYS_PER_MONTH)
  const months = lastMonth - firstMonth + 1
  if (months <= 0) return []
  const steps = [1, 2, 3, 6, 12, 24, 36, 60]
  const step = steps.find((s) => Math.ceil(months / s) <= maxCount) ?? Math.ceil(months / maxCount)
  const ticks: number[] = []
  for (let month = Math.ceil(firstMonth / step) * step; month <= lastMonth; month += step) ticks.push(month * DAYS_PER_MONTH)
  return ticks
}

/** Index of the value closest to `target` in an ascending list. */
export function nearestIndex(values: readonly number[], target: number): number {
  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - target) < Math.abs(values[best] - target)) best = i
  }
  return best
}

/** "Y2 M5": the month a day falls in, for axis labels. */
export function monthLabel(day: number): string {
  const months = Math.floor(day / DAYS_PER_MONTH)
  return `Y${Math.floor(months / 12) + 1} M${(months % 12) + 1}`
}
