/** "$1,234", "-$40", "$1.20M". Shared by event text in the sim and the UI. */
export function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

/** "940", "14,800", "1.25M": a head count, for users. */
export function formatCount(count: number): string {
  const n = Math.max(0, count)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  return Math.round(n).toLocaleString('en-US')
}

/* ---------------------------------------------------------------- UI helpers (from the standalone app's ui/format.ts) */

import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'

const MONTHS_PER_YEAR = 12

/** "+$120" / "-$40": always signed, for per-day deltas. */
export function formatDelta(amount: number): string {
  return `${amount < 0 ? '-' : '+'}${formatMoney(Math.abs(amount))}`
}

function splitDay(day: number): { year: number; month: number; dayOfMonth: number } {
  const daysPerYear = DAYS_PER_MONTH * MONTHS_PER_YEAR
  return {
    year: Math.floor(day / daysPerYear) + 1,
    month: Math.floor((day % daysPerYear) / DAYS_PER_MONTH) + 1,
    dayOfMonth: (day % DAYS_PER_MONTH) + 1,
  }
}

export function formatDate(day: number): string {
  const { year, month, dayOfMonth } = splitDay(day)
  return `Year ${year} · Month ${month} · Day ${dayOfMonth}`
}

export function formatDateShort(day: number): string {
  const { year, month, dayOfMonth } = splitDay(day)
  return `Y${year} M${month} D${dayOfMonth}`
}

export function formatDays(days: number): string {
  if (!Number.isFinite(days)) return '—'
  return days === 1 ? '1 day' : `${days} days`
}

export function qualityLabel(quality: number): string {
  if (quality >= 90) return 'Masterpiece'
  if (quality >= 80) return 'Great'
  if (quality >= 65) return 'Good'
  if (quality >= 50) return 'Okay'
  if (quality >= 30) return 'Rough'
  return 'Broken'
}

/** Demand relative to normal, e.g. "↑ +27%". */
export function formatDemand(demand: number): string {
  const percent = Math.round(Math.abs(demand - 1) * 100)
  if (percent < 3) return '≈ normal'
  return `${demand > 1 ? '↑ +' : '↓ −'}${percent}%`
}

export const TIER_NAME: Record<'small' | 'medium' | 'large', string> = { small: 'Small', medium: 'Medium', large: 'Large' }

/** "3 days", "5 months", "2 years": roughly how long ago, in game time. */
export function formatAge(days: number): string {
  if (days < DAYS_PER_MONTH) return days === 1 ? '1 day' : `${days} days`
  const months = Math.floor(days / DAYS_PER_MONTH)
  if (months < MONTHS_PER_YEAR) return months === 1 ? '1 month' : `${months} months`
  const years = Math.floor(months / MONTHS_PER_YEAR)
  return years === 1 ? '1 year' : `${years} years`
}
