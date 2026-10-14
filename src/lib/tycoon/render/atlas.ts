import { Assets, Rectangle, Texture } from 'pixi.js'
import { withBase } from '@/lib/apps/paths'
import { OFFICE_THEMES, shiftHueRgb } from '@/lib/tycoon/theme'
import { appearanceFor, CHARACTER_FRAMES, recolor, shirtColors } from '../render-support/characters'
import { blinkPatch, poseFrame, posePatches, type Pose } from '../render-support/poses'
import { workstationPixels, type WorkstationKind } from '../render-support/workstations'

type Frame = readonly [x: number, y: number, w: number, h: number]

// The art pack lives in `assets/pixeloffice/`; root-relative paths need the deployment base prefix.
const BASE = withBase('/pixeloffice/')

/** Sprite rectangles in PixelOfficeAssets.png (CC0 pack by 2dPig). */
const SHEET_FRAMES = {
  chairRed: [6, 41, 11, 22],
  chairOrange: [19, 41, 11, 22],
  chairGreen: [32, 41, 11, 22],
  chairBlue: [45, 41, 11, 22],
  chairWhite: [58, 41, 11, 22],
  chairGray: [71, 41, 11, 22],
  partition: [171, 44, 79, 17],
  deskLeft: [188, 63, 17, 19],
  deskPole: [207, 63, 4, 27],
  deskRight: [213, 63, 17, 19],
  floorTile: [3, 68, 73, 24],
  windowPlain: [59, 96, 26, 21],
  windowNote: [88, 96, 26, 21],
  doorHalf: [98, 120, 16, 31],
  clock: [159, 108, 19, 6],
  calendar: [234, 81, 17, 11],
  plant: [170, 65, 14, 19],
  sofaOrange: [120, 121, 33, 16],
  sofaGray: [119, 66, 33, 15],
  sofaBlue: [120, 83, 33, 16],
  sofaGreen: [120, 102, 33, 16],
  tableLong: [115, 47, 40, 16],
  whiteboard: [84, 70, 26, 20],
  picture: [239, 94, 11, 8],
  note: [183, 107, 6, 8],
  papers: [222, 94, 6, 8],
  towerRed: [211, 119, 11, 8],
  binGreen: [116, 143, 9, 14],
  binRed: [126, 143, 9, 14],
  binBlue: [136, 143, 9, 14],
  vending: [159, 123, 24, 34],
  snackCabinet: [184, 126, 24, 31],
  waterCooler: [147, 140, 9, 17],
  bins: [116, 143, 29, 14],
  counter: [85, 47, 26, 16],
  mug: [169, 95, 8, 7],
  coffeeMachine: [159, 91, 7, 11],
  flagIndia: [179, 94, 12, 9],
  flagUk: [193, 94, 12, 9],
  flagUs: [207, 94, 12, 9],
  cat: [65, 129, 16, 13],
  dog: [59, 146, 24, 11],
  char0: CHARACTER_FRAMES[0],
  char1: CHARACTER_FRAMES[1],
  char2: CHARACTER_FRAMES[2],
  char3: CHARACTER_FRAMES[3],
  char4: CHARACTER_FRAMES[4],
} as const satisfies Record<string, Frame>

export type FrameName = keyof typeof SHEET_FRAMES

/** A 1px-wide slice of plain wall in the example scene, stretched to cover the wall. */
const WALL_STRIP: Frame = [172, 48, 1, 64]

export interface Atlas {
  frame(name: FrameName): Texture
  /**
   * The picture for the person with this id: one of five sprites, with their own hair and shirt colours.
   * Without a pose they stand, legs and all; a pose sits them at a desk or draws them mid-action, and `blink` with their eyes shut; either is drawn on a
   * frame padded on both sides (see `POSE_PAD`).
   */
  character(id: number, pose?: Pose, blink?: boolean): Texture
  /** What is on a desk: a laptop, or a PC with its monitor and keyboard. */
  workstation(kind: WorkstationKind): Texture
  /** The dog with its tail cut off, so the tail can be drawn (and wiggled) on its own. */
  dogNoTail: Texture
  /** The dog's tail alone, cropped from the sheet; its pivot sits at the base against the body. */
  dogTail: Texture
  wallStrip: Texture
  /** The floor tile in an office theme's colours (see OFFICE_THEMES). */
  floorTile(theme: number): Texture
}

/** The dog's tail in sheet coordinates: the top-left corner of the dog frame. */
const DOG_TAIL: Frame = [59, 146, 5, 5]
/**
 * How much of that box to clear from the dog's body. Its bottom row is left in the body as a
 * shoulder the tail can hinge from, so the two never look detached while the tail swings.
 */
const DOG_TAIL_CUT_HEIGHT = 4

function slice(source: Texture, [x, y, w, h]: Frame): Texture {
  return new Texture({ source: source.source, frame: new Rectangle(x, y, w, h) })
}

interface SheetPixels {
  data: Uint8ClampedArray
  width: number
}

/** The sheet's raw pixels, for recolouring; null if the browser won't give them up (people then keep the original look). */
async function readSheetPixels(url: string): Promise<SheetPixels | null> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    return { data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width }
  } catch {
    return null
  }
}

export async function loadAtlas(): Promise<Atlas> {
  const [sheet, scene, pixels] = await Promise.all([
    Assets.load<Texture>(`${BASE}PixelOfficeAssets.png`),
    Assets.load<Texture>(`${BASE}PixelOffice.png`),
    readSheetPixels(`${BASE}PixelOfficeAssets.png`),
  ])
  sheet.source.scaleMode = 'nearest'
  scene.source.scaleMode = 'nearest'

  const cache = new Map<FrameName, Texture>()
  const frame = (name: FrameName): Texture => {
    let texture = cache.get(name)
    if (!texture) {
      texture = slice(sheet, SHEET_FRAMES[name])
      cache.set(name, texture)
    }
    return texture
  }

  const people = new Map<string, Texture>()
  const person = (id: number, pose?: Pose, blink = false): Texture => {
    const { character, hair, shirt } = appearanceFor(id)
    const base = frame(`char${character}` as FrameName)
    const eyes = blink ? blinkPatch(character) : undefined
    const patches = [...(pose ? posePatches(character, pose) : []), ...(eyes ? [eyes] : [])]
    if (!pixels || (hair === 0 && shirt === 0 && patches.length === 0)) return base

    const key = `${character}/${hair}/${shirt}/${pose ?? ''}/${eyes ? 'shut' : ''}`
    let texture = people.get(key)
    if (!texture) {
      const [x0, y0, width, height] = CHARACTER_FRAMES[character]
      const cut = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++) {
        const from = ((y0 + y) * pixels.width + x0) * 4
        cut.set(pixels.data.subarray(from, from + width * 4), y * width * 4)
      }
      // Recoloured first, so the pose's own pixels (sleeves in the shirt's colours, a white mug) are left alone.
      recolor(cut, width, character, hair, shirt)
      const drawn = patches.length > 0 ? poseFrame({ data: cut, width, height }, patches, shirtColors(character, shirt)) : { data: cut, width, height }
      const canvas = document.createElement('canvas')
      canvas.width = drawn.width
      canvas.height = drawn.height
      canvas.getContext('2d')!.putImageData(new ImageData(drawn.data as Uint8ClampedArray<ArrayBuffer>, drawn.width, drawn.height), 0, 0)
      texture = Texture.from(canvas)
      texture.source.scaleMode = 'nearest'
      people.set(key, texture)
    }
    return texture
  }

  // The dog is a single static sprite, so its tail is cut out here: the body keeps everything
  // but the tail, and the tail becomes a sprite that can swing from its base.
  const dogNoTail = (() => {
    const [x0, y0, width, height] = SHEET_FRAMES.dog
    if (!pixels) return frame('dog')
    const cut = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      const from = ((y0 + y) * pixels.width + x0) * 4
      cut.set(pixels.data.subarray(from, from + width * 4), y * width * 4)
    }
    const [tx, ty, tw] = DOG_TAIL
    for (let y = ty - y0; y < ty - y0 + DOG_TAIL_CUT_HEIGHT; y++) {
      for (let x = tx - x0; x < tx - x0 + tw; x++) cut[(y * width + x) * 4 + 3] = 0
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.putImageData(new ImageData(cut, width, height), 0, 0)
    const texture = Texture.from(canvas)
    texture.source.scaleMode = 'nearest'
    return texture
  })()

  /** A sheet frame's pixels, copied out so they can be changed. */
  const cut = (name: FrameName): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } | null => {
    if (!pixels) return null
    const [x0, y0, width, height] = SHEET_FRAMES[name]
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      const from = ((y0 + y) * pixels.width + x0) * 4
      data.set(pixels.data.subarray(from, from + width * 4), y * width * 4)
    }
    return { data, width, height }
  }
  const toTexture = ({ data, width, height }: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }): Texture => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.putImageData(new ImageData(data, width, height), 0, 0)
    const texture = Texture.from(canvas)
    texture.source.scaleMode = 'nearest'
    return texture
  }

  const workstations: Partial<Record<WorkstationKind, Texture>> = {}

  const floors = new Map<number, Texture>()
  const floorTile = (theme: number): Texture => {
    const index = theme % OFFICE_THEMES.length
    const { hue, saturation } = OFFICE_THEMES[index]
    let texture = floors.get(index)
    if (!texture) {
      const tile = index === 0 ? null : cut('floorTile')
      if (tile) {
        for (let i = 0; i < tile.data.length; i += 4) {
          const [r, g, b] = shiftHueRgb([tile.data[i], tile.data[i + 1], tile.data[i + 2]], hue, saturation)
          tile.data[i] = r
          tile.data[i + 1] = g
          tile.data[i + 2] = b
        }
      }
      texture = tile ? toTexture(tile) : frame('floorTile')
      floors.set(index, texture)
    }
    return texture
  }

  return {
    frame,
    floorTile,
    character: person,
    workstation: (kind) => (workstations[kind] ??= toTexture(workstationPixels(kind))),
    dogNoTail,
    dogTail: slice(sheet, DOG_TAIL),
    wallStrip: slice(scene, WALL_STRIP),
  }
}
