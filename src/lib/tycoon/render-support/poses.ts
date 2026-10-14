/**
 * Poses for the five character sprites. The pack gives each person one frame, standing with their arms down;
 * every other pose is that frame with patches of pixels drawn over it: first the arms that hang at their sides
 * are taken off the torso, then the arms are drawn where the pose has them. Everything else (face, hair, legs)
 * stays as the pack drew it, and a person who is not doing anything is drawn from the plain frame.
 *
 * The patches are generated from each sprite's pixels (shoulders, chin, mouth), so all five characters do a
 * pose the same way.
 */
import type { Rgb } from './characters'

export type Pose = 'typeA' | 'typeB' | 'think' | 'sip' | 'stretch'

export const POSE_NAMES: readonly Pose[] = ['typeA', 'typeB', 'think', 'sip', 'stretch']

/** Clear columns added on each side of a pose's frame, so arms can reach past the sprite's edges. */
export const POSE_PAD = { left: 3, right: 5 } as const

export interface Patch {
  /** Where the patch's top-left pixel goes, in the sprite's own coordinates (x can be negative, into the padding). */
  x: number
  y: number
  /**
   * One string per row. `.` leaves the pixel alone, a space clears it, a letter of `SPRITE_COLORS` paints it,
   * and `S` and `D` paint it in the person's shirt colour and its shadow, whatever shirt they wear.
   */
  rows: readonly string[]
}

/** The sprite's own sixteen-colour palette, by the letters patches are written in. */
export const SPRITE_COLORS: Readonly<Record<string, Rgb>> = {
  a: [0x1a, 0x1c, 0x2c], // outline
  b: [0x33, 0x3c, 0x57], // navy
  c: [0x56, 0x6c, 0x86], // slate
  d: [0xb1, 0x3e, 0x53], // red
  e: [0xef, 0x7d, 0x57], // orange, and the darker skin
  f: [0x94, 0xb0, 0xc2], // steel
  g: [0xf4, 0xf4, 0xf4], // white
  h: [0x3b, 0x5d, 0xc9], // blue
  i: [0x5d, 0x27, 0x5d], // plum
  j: [0xff, 0xcd, 0x75], // light skin
  k: [0x38, 0xb7, 0x64], // green
  l: [0x41, 0xa6, 0xf6], // sky
  m: [0x25, 0x71, 0x79], // teal
}

/**
 * Each character's torso with an arm taken off. The far arm is a band down the left of the torso, hand at the
 * hip: where the neck and legs allow, the outline moves in to the torso's own edge, so the figure is a pixel
 * slimmer; where hair shares that outline (3 and 4), the band is painted over as shirt. The near arm is the
 * torso's right-hand column, painted as the shirt's shadow. A pose takes off the arms it moves, so a person
 * always has exactly two.
 */
const TORSOS: readonly Readonly<Record<'near' | 'far', Patch>>[] = [
  // 0: dark-haired boy in a striped grey shirt
  { near: { x: 10, y: 14, rows: ['g', 'D', 'D', 'D'] }, far: { x: 2, y: 13, rows: [' .DS', ' agg', ' aDS', ' aDS', '..DS'] } },
  // 1: red-haired girl in a white shirt
  { near: { x: 10, y: 15, rows: ['D', 'D', 'D', 'D'] }, far: { x: 2, y: 14, rows: [' .DS', ' aDS', ' aDS', ' aDS', '..DS'] } },
  // 2: grey-haired man with glasses in a white shirt
  { near: { x: 9, y: 12, rows: ['D', 'D', 'D', 'D'] }, far: { x: 1, y: 11, rows: [' .DS', ' aDS', ' aDS', ' aDS', '..DS'] } },
  // 3: red-haired girl in a blue shirt
  { near: { x: 12, y: 14, rows: ['D', 'D', 'D', 'D'] }, far: { x: 5, y: 13, rows: ['.DS', 'DSS', 'DSS', 'DSS', '.DS'] } },
  // 4: dark-haired girl in a maroon top
  { near: { x: 12, y: 14, rows: ['D', 'D', 'D', 'D'] }, far: { x: 5, y: 13, rows: ['.DS', 'DSS', 'DSS', 'DSS', '.DS'] } },
]

/** Which arms each pose moves: the near one (on the keyboard's side) or both. */
const MOVES: Readonly<Record<Pose, readonly ('near' | 'far')[]>> = {
  typeA: ['near', 'far'],
  typeB: ['near', 'far'],
  think: ['near'],
  sip: ['near'],
  stretch: ['near', 'far'],
}

/**
 * The arms of each pose, by character number, drawn over the torso the pose leaves.
 * - Typing: both arms come from the shoulders, a little in from the edge of the chest, and run down to the
 *   keyboard close in front of the body; the far one a step higher and behind the near one (in the shirt's
 *   shadow, and behind any hair over the shoulder), so they almost merge at the hands. In `typeA` the near
 *   hand is down and the far one up; in `typeB` the other way round.
 * - Think: the near elbow rests on the desk side and the hand holds the chin.
 * - Sip: a white mug at the mouth, held by the near hand.
 * - Stretch: both arms up and out, hands beside the head.
 */
const POSES: readonly Readonly<Record<Pose, Patch>>[] = [
  // 0: dark-haired boy in a striped grey shirt
  {
    typeA: { x: 7, y: 13, rows: ['...Da', 'aSSaDa.aa', '.aSS.Daeea', '..aSSaaaea', '...aSSeea', '....aaeea', '......aa'] },
    typeB: { x: 7, y: 13, rows: ['...Da', 'aSSaDa', '.aSS.Daaa', '..aSSaeeaa', '...aSSeeaa', '....aaaaa'] },
    think: { x: 10, y: 10, rows: ['.aa', 'a.ea', '.eea', '.aSSa', 'SSSSa', '.SSSa', '..aa'] },
    sip: { x: 6, y: 8, rows: ['..a.a', 'agfa..a', 'agfa..a', '.aa.aSSa', '.....SSa', '.....SSa', '....SSSa', '.....SSa', '......a'] },
    stretch: { x: -2, y: 7, rows: ['.a..............aa', 'aeea............eea', 'aee.............eea', '.aSS..........aSSa', '..aSS........aSSa', '...aSS.......SSa', '....aSS.....SSa'] },
  },
  // 1: red-haired girl in a white shirt; she sits further back, so her forearms are longer
  {
    typeA: { x: 7, y: 14, rows: ['...Da', 'aSSaDa...aa', '.aSS.Daaajja', '..aSSaaaaaja', '...aSSSSjja', '....aaaajja', '........aa'] },
    typeB: { x: 7, y: 14, rows: ['...Da', 'aSSaDa', '.aSS.Daaaaa', '..aSSaaajjaa', '...aSSSSjjaa', '....aaaaaaa'] },
    think: { x: 10, y: 11, rows: ['.aa', 'a.ja', '.jja', '.aSSa', 'SSSSa', '.SSSa', '..aa'] },
    sip: { x: 6, y: 10, rows: ['.aa.aa', 'agfa..a', 'agfa', '.aa..SSa', '.....SSa', '....SSSa', '.....SSa', '......a'] },
    stretch: { x: -2, y: 8, rows: ['.a', 'ajja............jja', 'ajja............jja', '.aSS..........aSSa', '..aSS........aSSa', '...aSS.......SSa', '....aSS.....SSa'] },
  },
  // 2: grey-haired man with glasses in a white shirt
  {
    typeA: { x: 6, y: 11, rows: ['...Da', 'aSSaDa.aa', '.aSS.Dajja', '..aSSaaaja', '...aSSjja', '....aajja', '......aa'] },
    typeB: { x: 6, y: 11, rows: ['...Da', 'aSSaDa', '.aSS.Daaa', '..aSSajjaa', '...aSSjjaa', '....aaaaa'] },
    think: { x: 9, y: 8, rows: ['.aa', 'a.ja', '.jja', '.aSSa', 'SSSSa', '.SSSa', '..aa'] },
    sip: { x: 5, y: 6, rows: ['.a..aa', 'agfa..a', 'agfa..a', '.aa.aSSa', '.....SSa', '.....SSa', '....SSSa', '.....SSa', '......a'] },
    stretch: { x: -3, y: 5, rows: ['.aa.............aa', 'ajj.............jja', 'ajj.............jja', '.aSS..........aSSa', '..aSS........aSSa', '...aSS.......SSa', '....aSS.....SSa'] },
  },
  // 3: red-haired girl in a blue shirt; her hair hangs over the shoulder, in front of the far arm
  {
    typeA: { x: 9, y: 13, rows: ['...Da', 'aSSaD..aa', '.aSS.Dajja', '..aSSaaaja', '...aSSjja', '....a.jja', '......aa'] },
    typeB: { x: 9, y: 13, rows: ['...Da', 'aSSaD', '.aSS.Daaa', '..aSSajjaa', '...aSSjjaa', '....a.aaa'] },
    think: { x: 11, y: 10, rows: ['.aa', 'a.j', 'ajja', '..SSa', '.SSS', '..SSa', '...a'] },
    sip: { x: 8, y: 9, rows: ['.aa.aa', 'agf...a', 'agfa.j', '.aa..SS', '.....SSa', '....SSS', '.....SSa', '......a'] },
    stretch: { x: 0, y: 7, rows: ['..a.............aa', 'ajj.............jja', 'ajj.............jja', '..SS..........aSSa', '..aSS........aSSa', '...aSS.......SS', '.....SS.....SSa', '.....a'] },
  },
  // 4: dark-haired girl in a maroon top; drawn like 3
  {
    typeA: { x: 9, y: 13, rows: ['...Da', 'aSSaD..aa', '.aSS.Dajja', '..aSSaaaja', '...aSSjja', '....a.jja', '......aa'] },
    typeB: { x: 9, y: 13, rows: ['...Da', 'aSSaD', '.aSS.Daaa', '..aSSajjaa', '...aSSjjaa', '....a.aaa'] },
    think: { x: 11, y: 10, rows: ['.aa', 'a.j', 'ajja', '..SSa', '.SSS', '..SSa', '...a'] },
    sip: { x: 8, y: 9, rows: ['.aa.aa', 'agf...a', 'agfa.j', '.aa..SS', '.....SSa', '....SSS', '.....SSa', '......a'] },
    stretch: { x: 0, y: 7, rows: ['..a.............aa', 'ajj.............jja', 'ajj.............jja', '..SS..........aSSa', '..aSS........aSSa', '...aSS.......SS', '.....SS.....SSa', '.....a'] },
  },
]

/**
 * Each character's eyes shut, for a blink: the big eyes of 3 and 4 close to a line of lashes, the one-pixel eyes
 * of 0 and 1 shorten. 2's glasses hide his eyes, so he never seems to blink.
 */
const BLINKS: readonly (Patch | undefined)[] = [
  { x: 7, y: 7, rows: ['d...d'] },
  { x: 7, y: 8, rows: ['e...e'] },
  undefined,
  { x: 8, y: 7, rows: ['ee..ee', 'aa..aa'] },
  { x: 8, y: 7, rows: ['ee..ee', 'aa..aa'] },
]

/** The patch that shuts `character`'s eyes, if their eyes can be seen to shut. */
export const blinkPatch = (character: number): Patch | undefined => BLINKS[character]

/** The patches that draw `character` in `pose`, in order. */
export function posePatches(character: number, pose: Pose): readonly Patch[] {
  const torso = TORSOS[character]!
  return [...MOVES[pose].map((side) => torso[side]), POSES[character]![pose]]
}

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * A character's frame with patches drawn on it in turn, on a canvas padded by `POSE_PAD` on either side.
 * `shirt` is what `S` and `D` paint with.
 */
export function poseFrame(
  base: Pixels,
  patches: readonly Patch[],
  shirt: { main: Rgb; dark: Rgb },
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const width = POSE_PAD.left + base.width + POSE_PAD.right
  const data = new Uint8ClampedArray(width * base.height * 4)
  for (let y = 0; y < base.height; y++) {
    data.set(base.data.subarray(y * base.width * 4, (y + 1) * base.width * 4), (y * width + POSE_PAD.left) * 4)
  }

  const colors: Readonly<Record<string, Rgb>> = { ...SPRITE_COLORS, S: shirt.main, D: shirt.dark }
  for (const patch of patches) {
    patch.rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const mark = row[dx]!
        const at = ((patch.y + dy) * width + POSE_PAD.left + patch.x + dx) * 4
        const color = colors[mark]
        if (color) data.set([color[0], color[1], color[2], 0xff], at)
        else if (mark === ' ') data.set([0, 0, 0, 0], at)
      }
    })
  }
  return { data, width, height: base.height }
}
