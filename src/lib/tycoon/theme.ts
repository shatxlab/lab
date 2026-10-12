import type { Discipline } from '@/lib/tycoon/sim/types'

/** Shared by the canvas popups and the HTML UI so both use one palette. */
export const DISCIPLINE_COLORS: Record<Discipline, string> = {
  design: '#ff8fd0',
  engineering: '#6ec6ff',
  qa: '#8dff9a',
}

/** The blue of the office floor in the artwork. */
export const BASE_FLOOR_COLOR = '#41a6f6'

/**
 * Each office theme's floor: how far it turns the artwork's blue around the colour wheel, and how much of
 * its saturation it keeps (the blue at full strength reads as neon in other hues). Blue, green, plum, amber.
 */
export const OFFICE_THEMES: readonly { hue: number; saturation: number }[] = [
  { hue: 0, saturation: 1 },
  { hue: -70, saturation: 0.45 },
  { hue: 115, saturation: 0.4 },
  { hue: 175, saturation: 0.55 },
]

/**
 * Turns an [r, g, b] colour (0-255) around the colour wheel by `degrees`, keeping its lightness and
 * scaling its saturation by `saturation`.
 */
export function shiftHueRgb([r, g, b]: readonly number[], degrees: number, saturation = 1): [number, number, number] {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const light = (max + min) / 2
  if (max === min || (degrees === 0 && saturation === 1)) return [r, g, b]
  const delta = max - min
  const sat = (light > 0.5 ? delta / (2 - max - min) : delta / (max + min)) * saturation
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  let hue = max === rn ? (gn - bn) / delta + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4
  hue = (((hue * 60 + degrees) % 360) + 360) % 360

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const channel = (t: number) => {
    const u = ((t % 1) + 1) % 1
    const v = u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p
    return Math.round(v * 255)
  }
  const h = hue / 360
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
}

/** "#41a6f6" turned by `degrees`, its saturation scaled by `saturation`. */
export function shiftHue(hex: string, degrees: number, saturation = 1): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = shiftHueRgb([(n >> 16) & 255, (n >> 8) & 255, n & 255], degrees, saturation)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** The floor colour of each office's room, for its tab and for the space around the room. */
export const OFFICE_THEME_COLORS: readonly string[] = OFFICE_THEMES.map((t) => shiftHue(BASE_FLOOR_COLOR, t.hue, t.saturation))

/** The concrete of the garage floor. */
export const GARAGE_FLOOR_COLOR = '#94b0c2'

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  design: 'Design',
  engineering: 'Engineering',
  qa: 'QA',
}
