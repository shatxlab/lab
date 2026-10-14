import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { CHARACTER_COUNT, CHARACTER_FRAMES, OUTLINE_RGB, SHIRT_RAMPS, shirtColors } from '@/lib/tycoon/render-support/characters'
import { blinkPatch, POSE_NAMES, POSE_PAD, poseFrame, posePatches, type Pixels, type Pose } from '@/lib/tycoon/render-support/poses'

const sheet = PNG.sync.read(readFileSync('assets/pixeloffice/PixelOfficeAssets.png'))

/** One character's standing frame, cut out of the real sprite sheet. */
function standing(character: number): Pixels {
  const [x0, y0, width, height] = CHARACTER_FRAMES[character]!
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) data.set(sheet.data.subarray(((y0 + y) * sheet.width + x0) * 4, ((y0 + y) * sheet.width + x0 + width) * 4), y * width * 4)
  return { data, width, height }
}

const pixel = (frame: Pixels, x: number, y: number) =>
  x < 0 || y < 0 || x >= frame.width || y >= frame.height ? [0, 0, 0, 0] : [...frame.data.subarray((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 4)]

/** Coloured pixels (not outline) with clear background beside them, as "x,y" in the sprite's coordinates. */
function openEdges(frame: Pixels, left: number): string[] {
  const open: string[] = []
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const [r, g, b, a] = pixel(frame, x, y)
      if (a === 0 || (r === OUTLINE_RGB[0] && g === OUTLINE_RGB[1] && b === OUTLINE_RGB[2])) continue
      const touches = [pixel(frame, x - 1, y), pixel(frame, x + 1, y), pixel(frame, x, y - 1), pixel(frame, x, y + 1)].some((p) => p[3] === 0)
      if (touches) open.push(`${x - left},${y}`)
    }
  }
  return open
}

/**
 * `openEdges` of a posed frame. The one place a seated person is left open is the front of their leg, the side
 * that faces the desk: it has no outline there, because the desk has its own edge beside it.
 */
function openEdgesPosed(frame: Pixels, character: number, pose: Pose): string[] {
  if (pose === 'carry') return openEdges(frame, POSE_PAD.left)
  const leg = posePatches(character, 'sit')[1]!
  const front = leg.x + Math.max(...leg.rows.map((row) => row.length)) - 1
  return openEdges(frame, POSE_PAD.left).filter((at) => {
    const [x, y] = at.split(',').map(Number)
    return !(x === front && y >= leg.y && y < leg.y + leg.rows.length)
  })
}

const cases = Array.from({ length: CHARACTER_COUNT }, (_, character) => POSE_NAMES.map((pose) => ({ character, pose }))).flat()

describe('posePatches', () => {
  it.each(cases)('character $character can $pose, with patches inside the padded frame', ({ character, pose }) => {
    const [, , width, height] = CHARACTER_FRAMES[character]!
    for (const patch of posePatches(character, pose)) {
      expect(patch.x).toBeGreaterThanOrEqual(-POSE_PAD.left)
      expect(patch.y).toBeGreaterThanOrEqual(0)
      expect(patch.y + patch.rows.length).toBeLessThanOrEqual(height + POSE_PAD.bottom)
      for (const row of patch.rows) {
        expect(row).toMatch(/^[. a-pSD]+$/)
        expect(patch.x + row.length).toBeLessThanOrEqual(width + POSE_PAD.right)
      }
    }
  })

  it.each(cases)('character $character keeps a closed outline when they $pose', ({ character, pose }) => {
    // The pack outlines its people all round; an arm with a gap in its outline looks torn at this size.
    const frame = poseFrame(standing(character), posePatches(character, pose), shirtColors(character, 0))
    expect(openEdgesPosed(frame, character, pose)).toEqual([])
  })

  it('changes the picture for every pose, and the two typing frames differ', () => {
    for (let character = 0; character < CHARACTER_COUNT; character++) {
      const base = standing(character)
      const drawn = (pose: Pose) => [...poseFrame(base, posePatches(character, pose), shirtColors(character, 0)).data].join()
      const plain = [...poseFrame(base, [], shirtColors(character, 0)).data].join()
      for (const pose of POSE_NAMES) expect(drawn(pose)).not.toBe(plain)
      expect(drawn('typeA')).not.toBe(drawn('typeB'))
    }
  })

  it.each(cases)('character $character can blink while they $pose, eyes inside the face', ({ character, pose }) => {
    const eyes = blinkPatch(character)
    if (!eyes) return
    const open = poseFrame(standing(character), posePatches(character, pose), shirtColors(character, 0))
    const shut = poseFrame(standing(character), [...posePatches(character, pose), eyes], shirtColors(character, 0))
    expect(openEdgesPosed(shut, character, pose)).toEqual([])
    expect([...shut.data].join()).not.toBe([...open.data].join())
    // a blink only ever paints over the face: nothing that was clear becomes coloured
    for (let i = 3; i < shut.data.length; i += 4) if (open.data[i] === 0) expect(shut.data[i]).toBe(0)
  })

  it.each(cases.filter(({ pose }) => pose !== 'carry'))('character $character sits with one leg forward, not on two feet, when they $pose', ({ character, pose }) => {
    // The pack's people end in two feet side by side, which at a desk looks like standing on the chair: seated
    // they cross the floor with a single leg running forward, so the bottom row is one run of pixels.
    const frame = poseFrame(standing(character), posePatches(character, pose), shirtColors(character, 0))
    const row = (y: number) => Array.from({ length: frame.width }, (_, x) => pixel(frame, x, y)[3] > 0)
    const last = [...Array(frame.height).keys()].reverse().find((y) => row(y).some(Boolean))!
    const runs = row(last).filter((on, x, all) => on && !all[x - 1]).length
    expect(runs).toBe(1)
    const feet = standing(character)
    const standingRuns = Array.from({ length: feet.width }, (_, x) => pixel(feet, x, feet.height - 1)[3] > 0).filter((on, x, all) => on && !all[x - 1]).length
    expect(standingRuns).toBe(2)
  })

  it.each(Array.from({ length: CHARACTER_COUNT }, (_, character) => ({ character })))('character $character carries a box in front of them and keeps both feet', ({ character }) => {
    const frame = poseFrame(standing(character), posePatches(character, 'carry'), shirtColors(character, 0))
    const cardboard = [0xa8, 0x74, 0x3a]
    const boxes = Array.from({ length: frame.width * frame.height }, (_, i) => [...frame.data.subarray(i * 4, i * 4 + 3)]).filter((p) => p.join() === cardboard.join())
    expect(boxes.length).toBeGreaterThan(2)
    const feet = Array.from({ length: frame.width }, (_, x) => pixel(frame, x, standing(character).height - 1)[3] > 0).filter((on, x, all) => on && !all[x - 1]).length
    expect(feet).toBe(2)
  })

  it('outlines the standing frames all round too, which is what the poses are held to', () => {
    for (let character = 0; character < CHARACTER_COUNT; character++) expect(openEdges(standing(character), 0)).toEqual([])
  })
})

describe('poseFrame', () => {
  const base = { width: 3, height: 2, data: new Uint8ClampedArray([...[1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255], ...[10, 11, 12, 255, 13, 14, 15, 255, 16, 17, 18, 255]]) }
  const shirt = { main: [100, 110, 120] as const, dark: [50, 55, 60] as const }

  it('pads the canvas on both sides and keeps the sprite in the middle', () => {
    const frame = poseFrame(base, [], shirt)
    expect(frame.width).toBe(POSE_PAD.left + 3 + POSE_PAD.right)
    expect(frame.height).toBe(2 + POSE_PAD.bottom)
    expect(pixel(frame, POSE_PAD.left + 1, 1)).toEqual([13, 14, 15, 255])
    expect(pixel(frame, 0, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(frame, POSE_PAD.left + 3, 0)).toEqual([0, 0, 0, 0])
  })

  it('paints palette letters, paints S and D in the shirt given, clears spaces and leaves dots alone', () => {
    const frame = poseFrame(base, [{ x: 0, y: 0, rows: ['aSD', '.e '] }], shirt)
    const at = (x: number, y: number) => pixel(frame, POSE_PAD.left + x, y)
    expect(at(0, 0)).toEqual([0x1a, 0x1c, 0x2c, 255])
    expect(at(1, 0)).toEqual([100, 110, 120, 255])
    expect(at(2, 0)).toEqual([50, 55, 60, 255])
    expect(at(0, 1)).toEqual([10, 11, 12, 255])
    expect(at(1, 1)).toEqual([0xef, 0x7d, 0x57, 255])
    expect(at(2, 1)).toEqual([0, 0, 0, 0])
  })

  it('can paint into the padding on either side', () => {
    const frame = poseFrame(base, [{ x: -POSE_PAD.left, y: 1, rows: ['S'] }, { x: 3, y: 0, rows: ['D'] }], shirt)
    expect(pixel(frame, 0, 1)).toEqual([100, 110, 120, 255])
    expect(pixel(frame, POSE_PAD.left + 3, 0)).toEqual([50, 55, 60, 255])
  })

  it('draws patches in order, later ones over earlier ones', () => {
    const frame = poseFrame(base, [{ x: 0, y: 0, rows: ['aa'] }, { x: 1, y: 0, rows: ['e'] }], shirt)
    expect(pixel(frame, POSE_PAD.left, 0)).toEqual([0x1a, 0x1c, 0x2c, 255])
    expect(pixel(frame, POSE_PAD.left + 1, 0)).toEqual([0xef, 0x7d, 0x57, 255])
  })

  it('does not change the frame it is given', () => {
    const before = [...base.data]
    poseFrame(base, [{ x: 0, y: 0, rows: ['aaa'] }], shirt)
    expect([...base.data]).toEqual(before)
  })
})

describe('shirtColors', () => {
  it('is the sprite’s own shirt for shirt 0, and the ramp worn otherwise', () => {
    expect(shirtColors(0, 0)).toEqual({ main: [0x94, 0xb0, 0xc2], dark: [0x56, 0x6c, 0x86] })
    expect(shirtColors(4, 0)).toEqual({ main: [0xb1, 0x3e, 0x53], dark: [0x5d, 0x27, 0x5d] })
    expect(shirtColors(2, 3)).toEqual({ main: SHIRT_RAMPS[2]!.main, dark: SHIRT_RAMPS[2]!.dark })
  })
})
