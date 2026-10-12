import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import {
  appearanceFor,
  CHARACTER_COUNT,
  CHARACTER_FRAMES,
  HAIR_RAMPS,
  OUTLINE_RGB,
  recolor,
  RULES,
  SHIRT_RAMPS,
  type Rgb,
} from '@/lib/tycoon/render-support/characters'

const sheet = PNG.sync.read(readFileSync('assets/pixeloffice/PixelOfficeAssets.png'))
const SKIN: Rgb = [0xff, 0xcd, 0x75]

/** One character's pixels, cut out of the real sprite sheet. */
function frameOf(character: number): { pixels: Uint8ClampedArray; width: number; height: number } {
  const [x0, y0, width, height] = CHARACTER_FRAMES[character]
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = ((y0 + y) * sheet.width + (x0 + x)) * 4
      pixels.set(sheet.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  }
  return { pixels, width, height }
}

const colourAt = (pixels: Uint8ClampedArray, i: number): Rgb => [pixels[i], pixels[i + 1], pixels[i + 2]]
const same = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const recolored = (character: number, hair: number, shirt: number) => {
  const frame = frameOf(character)
  recolor(frame.pixels, frame.width, character, hair, shirt)
  return frame.pixels
}
const changedCount = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let n = 0
  for (let i = 0; i < a.length; i += 4) if (!same(colourAt(a, i), colourAt(b, i))) n += 1
  return n
}

describe('appearanceFor', () => {
  it('always gives the same person the same look, within range', () => {
    for (let id = 1; id < 300; id++) {
      const a = appearanceFor(id)
      expect(appearanceFor(id)).toEqual(a)
      expect(a.character).toBeGreaterThanOrEqual(0)
      expect(a.character).toBeLessThan(CHARACTER_COUNT)
      expect(a.hair).toBeGreaterThanOrEqual(0)
      expect(a.hair).toBeLessThanOrEqual(HAIR_RAMPS.length)
      expect(a.shirt).toBeGreaterThanOrEqual(0)
      expect(a.shirt).toBeLessThanOrEqual(SHIRT_RAMPS.length)
    }
  })

  it('spreads across sprites, hair and shirts, so a team does not look cloned', () => {
    const looks = new Set<string>()
    const characters = new Set<number>()
    for (let id = 1; id <= 200; id++) {
      const a = appearanceFor(id)
      looks.add(`${a.character}/${a.hair}/${a.shirt}`)
      characters.add(a.character)
    }
    expect(characters.size).toBe(CHARACTER_COUNT)
    expect(looks.size).toBeGreaterThan(120) // 5 x 8 x 8 = 320 possible looks
  })

  it('a team of twelve is mostly distinct', () => {
    for (const start of [1, 50, 400]) {
      const looks = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(appearanceFor(start + i * 3))))
      expect(looks.size).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('recolor, against the real sprites', () => {
  it('leaves a sprite exactly as drawn for the original hair and shirt', () => {
    for (let c = 0; c < CHARACTER_COUNT; c++) expect(recolored(c, 0, 0)).toEqual(frameOf(c).pixels)
  })

  it('every rule matches pixels that really are there (the row bands are right)', () => {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      const { pixels, width } = frameOf(c)
      for (const rule of RULES[c]) {
        let found = 0
        for (let i = 0; i < pixels.length; i += 4) {
          const row = Math.floor(i / 4 / width)
          if (pixels[i + 3] > 0 && row >= rule.rows[0] && row <= rule.rows[1] && same(colourAt(pixels, i), rule.from)) found += 1
        }
        expect(found, `character ${c} ${rule.part} rows ${rule.rows}`).toBeGreaterThan(0)
      }
    }
  })

  it('never touches outlines, skin or transparency, whatever the ramps', () => {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      const original = frameOf(c).pixels
      for (let h = 0; h <= HAIR_RAMPS.length; h++) {
        for (let s = 0; s <= SHIRT_RAMPS.length; s++) {
          const out = recolored(c, h, s)
          for (let i = 0; i < original.length; i += 4) {
            expect(out[i + 3]).toBe(original[i + 3])
            const was = colourAt(original, i)
            if (original[i + 3] > 0 && (same(was, OUTLINE_RGB) || same(was, SKIN))) expect(colourAt(out, i)).toEqual(was)
          }
        }
      }
    }
  })

  it('a new hair ramp changes a good number of pixels, and only hair rows', () => {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      const original = frameOf(c).pixels
      const out = recolored(c, 2, 0) // brown hair, original shirt
      expect(changedCount(original, out), `character ${c}`).toBeGreaterThanOrEqual(15)
      // the shirt is untouched
      const shirtRows = RULES[c].filter((r) => r.part === 'shirt').map((r) => r.rows)
      const width = CHARACTER_FRAMES[c][2]
      for (const [first, last] of shirtRows) {
        const from = first * width * 4
        const to = (last + 1) * width * 4
        for (let i = from; i < to; i += 4) {
          const hairHere = RULES[c].some((r) => r.part === 'hair' && Math.floor(i / 4 / width) >= r.rows[0] && Math.floor(i / 4 / width) <= r.rows[1])
          if (!hairHere) expect(colourAt(out, i)).toEqual(colourAt(original, i))
        }
      }
    }
  })

  it('a new shirt ramp changes the shirt and nothing above the shirt rows', () => {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      const original = frameOf(c).pixels
      const out = recolored(c, 0, 3) // green shirt, original hair
      expect(changedCount(original, out), `character ${c}`).toBeGreaterThanOrEqual(8)
      const firstShirtRow = Math.min(...RULES[c].filter((r) => r.part === 'shirt').map((r) => r.rows[0]))
      const width = CHARACTER_FRAMES[c][2]
      for (let i = 0; i < firstShirtRow * width * 4; i += 4) expect(colourAt(out, i)).toEqual(colourAt(original, i))
    }
  })

  it('every recoloured pixel is a colour from the chosen ramp', () => {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      const original = frameOf(c).pixels
      const out = recolored(c, 4, 5)
      const hairRamp = HAIR_RAMPS[3]
      const shirtRamp = SHIRT_RAMPS[4]
      const allowed: Rgb[] = [hairRamp.dark, hairRamp.main, hairRamp.light, shirtRamp.dark, shirtRamp.main, shirtRamp.light]
      for (let i = 0; i < out.length; i += 4) {
        if (same(colourAt(out, i), colourAt(original, i))) continue
        expect(allowed.some((a) => same(a, colourAt(out, i)))).toBe(true)
      }
    }
  })

  it('different ramps give different pictures', () => {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      const hairs = new Set(Array.from({ length: HAIR_RAMPS.length + 1 }, (_, h) => Array.from(recolored(c, h, 0)).join(',')))
      expect(hairs.size).toBeGreaterThanOrEqual(HAIR_RAMPS.length) // the sprite's own hair may equal one ramp
      const shirts = new Set(Array.from({ length: SHIRT_RAMPS.length + 1 }, (_, s) => Array.from(recolored(c, 0, s)).join(',')))
      expect(shirts.size).toBeGreaterThanOrEqual(SHIRT_RAMPS.length)
    }
  })
})
