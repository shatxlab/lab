/**
 * Poses for the five character sprites. The pack gives each person one frame, standing with their arms down;
 * every other pose is that frame with patches of pixels drawn over it: first the legs come off, because a
 * person at a desk is hidden from the hips down by their chair and desk and is drawn sitting on it, then the
 * arms that hang at their sides are taken off the torso, then the arms are drawn where the pose has them.
 * Everything else (face, hair) stays as the pack drew it. Only someone standing, as when they walk out with
 * their box, is drawn from the plain frame, legs and all, or carrying the box in both hands.
 *
 * The patches are generated from each sprite's pixels (shoulders, chin, mouth), so all five characters do a
 * pose the same way.
 */
import type { Rgb } from './characters'

/** `sit` is sitting at the desk with nothing to do: the arms hang as the pack drew them, the legs are gone. */
export type Pose = 'sit' | 'typeA' | 'typeB' | 'think' | 'sip' | 'stretch' | 'carry'

export const POSE_NAMES: readonly Pose[] = ['sit', 'typeA', 'typeB', 'think', 'sip', 'stretch', 'carry']

/** The poses at a desk that move the arms. */
type Move = Exclude<Pose, 'sit' | 'carry'>

/**
 * Clear rows and columns added around a pose's frame: on each side, so arms can reach past the sprite's edges, and
 * below, so a seated leg can run further down than the pack's standing feet.
 */
export const POSE_PAD = { left: 3, right: 5, bottom: 2 } as const

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
  n: [0xa8, 0x74, 0x3a], // cardboard
  o: [0xc8, 0x93, 0x5a], // a box's lid
  p: [0xe8, 0xc0, 0x8a], // tape
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

/**
 * A leg seen from the side: a thigh running forward from the hips, a shin `shin` rows long, then a boot in the colour of their standing shoes, below the
 * hem at row `hem` (the thigh's top edge is outlined over the hem). The sole ends two rows below the pack's feet. It ends `7 + reach` columns from `x`, its
 * last column against the desk's edge, so it reads as running in under the desk. That front, the side that faces the
 * desk, has no outline: the desk has its own edge there, and the two would make a heavy double line.
 */
function legs(x: number, hem: number, pants: string, boots: string, shin: 1 | 2, reach = 0): Patch {
  // `reach` lengthens the thigh, moving the knee, shin and boot that many columns forward.
  const more = (letter: string) => letter.repeat(reach)
  const rows = [
    `.....aa${more('a')}`,
    `aPPPPPP${more('P')}`,
    `.aaaa${more('a')}PP`,
    ...Array<string>(shin - 1).fill(`....${more('.')}aPP`),
    `....${more('.')}aBB`,
    `....${more('.')}aBB`,
    `....${more('.')}aaa`,
  ]
  return { x, y: hem, rows: rows.map((row) => row.replaceAll('P', pants).replaceAll('B', boots)) }
}

/**
 * Each character without legs, for sitting: the legs are cleared and the hem of the shirt (or skirt) is closed
 * with the outline, so the body ends in a flat edge where the chair and desk would hide the rest. The chair
 * shows below it, so they sit on it rather than hover over it.
 */
const SEATED: readonly (readonly Patch[])[] = [
  // 0: the shirt already ends in an outline row
  [{ x: 2, y: 19, rows: Array<string>(4).fill(' '.repeat(11)) }, legs(5, 18, 'h', 'b', 2)],
  // 1: the outline closes the shirt where the legs start; she is the widest sprite, so her knee is a column short of the others'
  [{ x: 2, y: 19, rows: ['.aaaaaaaa.', ...Array<string>(4).fill(' '.repeat(10))] }, legs(6, 19, 'b', 'c', 2, 1)],
  // 2: the same, under a shorter shirt
  [{ x: 1, y: 16, rows: ['.aaaaaaaaa', ...Array<string>(4).fill(' '.repeat(10))] }, legs(4, 16, 'h', 'c', 2)],
  // 3: the skirt's hem is the outline
  [{ x: 4, y: 20, rows: Array<string>(3).fill(' '.repeat(10)) }, legs(6, 19, 'e', 'c', 1)],
  // 4: drawn like 3
  [{ x: 4, y: 20, rows: Array<string>(3).fill(' '.repeat(10)) }, legs(6, 19, 'e', 'c', 1)],
]

/** The cardboard box a person carries out when they leave, a pixel of outline all round, with the tape on its lid. */
const BOX: readonly string[] = ['aaaaaaa', 'aoooooa', 'annnnna', 'annnnna', 'annnnna', 'aaaaaaa']

/**
 * Where each character holds the box, facing right: the top-left pixel of the box in the sprite's own coordinates,
 * and the letter of their skin. The box is held at its two ends, between the hands: the near arm comes down from
 * the shoulder to a hand on the end by the body, in front of the box; the far hand grips the other end from
 * behind it, so only its fingers show past the box's edge.
 */
const CARRY: readonly (readonly [x: number, y: number, skin: string])[] = [
  [9, 14, 'e'],
  [9, 15, 'j'],
  [8, 12, 'j'],
  [11, 14, 'j'],
  [11, 14, 'j'],
]

/** The arm patches of someone carrying a box: the far hand, which goes behind the box, the box, and the near arm over it. */
function carry(character: number): readonly Patch[] {
  const [x, y, skin] = CARRY[character]!
  const torso = TORSOS[character]!
  return [
    torso.near,
    torso.far,
    { x: x + 7, y: y + 1, rows: ['aaa', `${skin}${skin}a`, `${skin}${skin}a`, 'aaa'] },
    { x, y, rows: BOX },
    { x: x - 1, y: y - 1, rows: ['.DSa', '.DSa', `a${skin}${skin}a`, `a${skin}${skin}a`, '.aa.'] },
  ]
}

/** Which arms each pose moves: the near one (on the keyboard's side) or both. */
const MOVES: Readonly<Record<Move, readonly ('near' | 'far')[]>> = {
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
const POSES: readonly Readonly<Record<Move, Patch>>[] = [
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
  if (pose === 'carry') return carry(character)
  const seated = SEATED[character]!
  if (pose === 'sit') return seated
  return [...seated, ...MOVES[pose].map((side) => torso[side]), POSES[character]![pose]]
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
  const height = base.height + POSE_PAD.bottom
  const data = new Uint8ClampedArray(width * height * 4)
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
  return { data, width, height }
}
