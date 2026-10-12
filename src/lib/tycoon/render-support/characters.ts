/**
 * Variety for the five character sprites. Each sprite's hair and shirt pixels are recoloured from
 * a small set of ramps, so two people drawn from the same sprite rarely look alike. Skin, outlines,
 * eyes and logos are never touched. The rules below were read off the sprites pixel by pixel.
 */

export type Rgb = readonly [number, number, number]

/** A colour in three steps; every ramp is used the same way: dark for shading, main for the body, light for highlights. */
export interface Ramp {
  name: string
  dark: Rgb
  main: Rgb
  light: Rgb
}

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]
const ramp = (name: string, dark: string, main: string, light: string): Ramp => ({
  name,
  dark: rgb(dark),
  main: rgb(main),
  light: rgb(light),
})

export const HAIR_RAMPS: readonly Ramp[] = [
  ramp('black', '#262638', '#333c57', '#566c86'),
  ramp('brown', '#4a2618', '#7a4a2e', '#a8744a'),
  ramp('blonde', '#a87a22', '#e0b04a', '#ffe08a'),
  ramp('ginger', '#9a3a1a', '#d4602c', '#ef7d57'),
  ramp('purple', '#3a1f4d', '#6b3d82', '#9a6bb0'),
  ramp('teal', '#1f4a4f', '#257179', '#41a6c4'),
  ramp('silver', '#566c86', '#94b0c2', '#d4dde6'),
]

export const SHIRT_RAMPS: readonly Ramp[] = [
  ramp('red', '#7a2535', '#b13e53', '#d4607a'),
  ramp('blue', '#2a47a0', '#3b5dc9', '#41a6f6'),
  ramp('green', '#256b3a', '#38b764', '#73d68e'),
  ramp('orange', '#a8452a', '#ef7d57', '#ffa882'),
  ramp('purple', '#4a2050', '#8a4a8a', '#b87cc0'),
  ramp('teal', '#1f5a5f', '#257179', '#3aa0a0'),
  ramp('pink', '#a02a6a', '#d6498a', '#f08ab8'),
]

/** Sheet position of each character: x, y, width, height. */
export const CHARACTER_FRAMES = [
  [2, 105, 15, 23],
  [19, 104, 19, 24],
  [40, 107, 13, 21],
  [3, 132, 17, 23],
  [22, 132, 17, 23],
] as const

export const CHARACTER_COUNT = CHARACTER_FRAMES.length

type Slot = 'dark' | 'main' | 'light'

interface Rule {
  /** The sprite colour this rule recolours... */
  from: Rgb
  /** ...but only on these rows (inclusive), so the same colour elsewhere (eyes, mouth, shoes) is left alone. */
  rows: readonly [number, number]
  part: 'hair' | 'shirt'
  slot: Slot
}

const OUTLINE = '#1a1c2c'
const NAVY = rgb('#333c57')
const SLATE = rgb('#566c86')
const RED = rgb('#b13e53')
const ORANGE = rgb('#ef7d57')
const STEEL = rgb('#94b0c2')
const WHITE = rgb('#f4f4f4')
const BLUE = rgb('#3b5dc9')
const SKY = rgb('#41a6f6')
const PLUM = rgb('#5d275d')

const hair = (from: Rgb, slot: Slot, first: number, last: number): Rule => ({ from, rows: [first, last], part: 'hair', slot })
const shirt = (from: Rgb, slot: Slot, first: number, last: number): Rule => ({ from, rows: [first, last], part: 'shirt', slot })

export const RULES: readonly (readonly Rule[])[] = [
  // 0: dark-haired boy in a striped grey shirt
  [hair(NAVY, 'main', 1, 9), hair(SLATE, 'light', 1, 2), shirt(STEEL, 'main', 13, 17), shirt(SLATE, 'dark', 13, 17)],
  // 1: red-haired girl in a white shirt
  [hair(RED, 'main', 0, 10), hair(PLUM, 'dark', 0, 10), hair(ORANGE, 'light', 2, 3), shirt(WHITE, 'main', 14, 18), shirt(STEEL, 'dark', 14, 17)],
  // 2: grey-haired man with glasses in a white shirt
  [hair(STEEL, 'main', 1, 4), hair(SLATE, 'dark', 1, 4), shirt(WHITE, 'main', 11, 15), shirt(STEEL, 'dark', 11, 15)],
  // 3: red-haired girl in a blue shirt
  [hair(RED, 'main', 1, 13), hair(PLUM, 'dark', 1, 13), hair(ORANGE, 'light', 1, 2), shirt(SKY, 'main', 12, 17), shirt(BLUE, 'dark', 12, 17)],
  // 4: dark-haired girl in a maroon top
  [hair(NAVY, 'main', 1, 13), hair(SLATE, 'light', 1, 13), shirt(RED, 'main', 12, 17), shirt(PLUM, 'dark', 12, 17)],
]

export const OUTLINE_RGB = rgb(OUTLINE)

/** Which sprite a person is drawn from, and which hair and shirt ramp they wear (0 = the sprite's own). */
export interface Appearance {
  character: number
  hair: number
  shirt: number
}

/** The same person always looks the same: a hash of their id picks the sprite and both ramps. */
export function appearanceFor(id: number): Appearance {
  const h = Math.imul(id + 1, 2654435761) >>> 0
  return {
    character: h % CHARACTER_COUNT,
    hair: (h >>> 5) % (HAIR_RAMPS.length + 1),
    shirt: (h >>> 13) % (SHIRT_RAMPS.length + 1),
  }
}

/**
 * Recolours one character's pixels in place. `pixels` is that character's frame alone, RGBA, row by row.
 * Hair and shirt 0 leave the sprite as drawn.
 */
export function recolor(pixels: Uint8ClampedArray | Uint8Array, width: number, character: number, hairIndex: number, shirtIndex: number): void {
  const ramps = { hair: hairIndex > 0 ? HAIR_RAMPS[hairIndex - 1] : undefined, shirt: shirtIndex > 0 ? SHIRT_RAMPS[shirtIndex - 1] : undefined }
  const rules = RULES[character]
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue
    const row = Math.floor(i / 4 / width)
    for (const rule of rules) {
      const colours = ramps[rule.part]
      if (!colours || row < rule.rows[0] || row > rule.rows[1]) continue
      if (pixels[i] !== rule.from[0] || pixels[i + 1] !== rule.from[1] || pixels[i + 2] !== rule.from[2]) continue
      const to = colours[rule.slot]
      pixels[i] = to[0]
      pixels[i + 1] = to[1]
      pixels[i + 2] = to[2]
      break
    }
  }
}
