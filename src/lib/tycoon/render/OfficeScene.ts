import { Container, Graphics, RenderTexture, Sprite, Text, type Application, type PointData, type Texture } from 'pixi.js'
import { MORALE_UNHAPPY } from '@/lib/tycoon/sim/balance'
import { getOffice, officeSpec, staffOf } from '@/lib/tycoon/sim/offices'
import { DISCIPLINES, type Discipline, type Employee, type GameState, type Role, type Office, type OfficeKind } from '@/lib/tycoon/sim/types'
import { DISCIPLINE_COLORS } from '@/lib/tycoon/theme'
import type { Atlas, FrameName } from './atlas'
import { chairX, MIN_WIDTH, partitionAt, partitionInFront, ROOM_TOP, roomBottom, sceneLayout, seatX, type Arrangement, type SceneLayout } from '../render-support/layout'
import { SeatMap } from '../render-support/seats'
import { chairTucked, CHAIR_TUCK, hasComputer, vacancyFor, type Vacancy } from '../render-support/vacancy'
import { blinkingAt, momentAt } from '../render-support/activity'
import { KEEPSAKE_TOP, keepsakeFor, keepsakeX } from '../render-support/keepsakes'
import { POSE_PAD, STEP_CYCLE, WALK_CYCLE, type Pose } from '../render-support/poses'
import { pathLength, pathToDoors, pointAlong, routePath, walkoutPath, type Point } from '../render-support/walkout'
import { chooseErrand, chooseSpot, nextOutAt, poseAtSpot, SPOTS, spotFree, stayFor, type Errand, type Spot, type Stay } from '../render-support/breaks'
import { BOOKSHELF_HEIGHT, bookshelfRects } from '../render-support/bookshelf'
import { CURSOR, KEY_DOWN, pressedKeys, SCREEN_ON, typingScreen, WORKSTATIONS, workstationsFor, type WorkstationSpec } from '../render-support/workstations'
import { formatDateShort } from '@/lib/tycoon/format'

/** Size of the room's artwork in sprite pixels. Walls and floor go on beyond it as far as the screen needs. */
export const SCENE_W = 256
export const SCENE_H = 224

const WALL_TOP = ROOM_TOP
const FLOOR_TOP = 112
const MAX_POPUPS = 24
const POPUP_MS = 1100
/** How long one keystroke takes on a desk's screen. */
const TYPING_STEP_MS = 110
/** The width of the desk top, which is where a computer sits against its edge. */
const DESK_WIDTH = 17
/** How far the desk top runs from the partition toward the viewer. */
const DESK_DEPTH = 19
/** Bug-fixing popups are red, with a little bug beside the number. */
const BUG_RED = 0xff5a6a
const INK = 0x14141f

const CHAIRS: readonly FrameName[] = ['chairWhite', 'chairBlue', 'chairGreen', 'chairOrange', 'chairRed', 'chairGray']
/** Each office theme gets its own sofa, so the rooms differ in more than the floor. */
const THEME_SOFAS: readonly FrameName[] = ['sofaOrange', 'sofaBlue', 'sofaGreen', 'sofaGray']

// The garage's own palette, from the same 16 colours as the artwork.
const BLOCK = 0x94b0c2
const MORTAR = 0x566c86
const DARK = 0x333c57
const WHITE = 0xf4f4f4
const WOOD = 0xef7d57
const RUST = 0xb13e53
const SAND = 0xffcd75

const colorNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16)

function placed(texture: Texture, x: number, y: number, flip = false): Sprite {
  const sprite = new Sprite(texture)
  if (flip) {
    sprite.scale.x = -1
    sprite.x = x + texture.width
  } else {
    sprite.x = x
  }
  sprite.y = y
  return sprite
}

/**
 * Rows from the top of a partition to the top of a chair. The pack's chairs are drawn for a person standing beside
 * them; with the seat this low, the sitter's thighs rest on it rather than hanging past its front edge.
 */
const CHAIR_TOP = 9

/** The row of a seated person's feet, counted from the top of their seat (see `seat`). */
const FEET_ROW = 22

/** Where a workstation's occupant sits in an arrangement: horizontal centre, and the top of a 23-row person's head. */
function seat(arrangement: Arrangement, index: number): { x: number; y: number } {
  const [px, py] = partitionAt(arrangement, index >> 1)
  return { x: px + seatX((index & 1) === 1), y: py + 5 }
}

/** The sprites face right; whoever sits on the right of a partition has their computer to the left. */
const facesLeft = (index: number): boolean => (index & 1) === 1

/** A 7x7 pixel ladybug with its bottom centre at the origin. */
function bugGraphic(): Graphics {
  const g = new Graphics()
  g.rect(2, 0, 1, 1).rect(4, 0, 1, 1).rect(2, 1, 3, 1).fill(INK) // antennae and head
  g.rect(0, 2, 1, 1).rect(6, 2, 1, 1).rect(0, 4, 1, 1).rect(6, 4, 1, 1).rect(3, 2, 1, 5).fill(INK) // legs and wing seam
  g.rect(1, 2, 2, 4).rect(4, 2, 2, 4).rect(2, 6, 1, 1).rect(4, 6, 1, 1).fill(BUG_RED) // wings
  g.rect(1, 3, 1, 1).rect(5, 4, 1, 1).fill(INK) // spots
  g.pivot.set(3.5, 7)
  return g
}

/**
 * What a desk needs to stand on its own, in the garage (which has no partitions) or in an office's last row,
 * drawn from the desk's top-left corner: an edge down the side the pack leaves open (in an office it meets the
 * pole between two desks), the front of the desk and two legs. The pack only draws desks running up to the next
 * partition, so a bare desk top on the floor looks sunk into it.
 */
function freestandingDesk(right: boolean): Graphics {
  const g = new Graphics()
  const front = DESK_DEPTH
  g.rect(right ? 0 : DESK_WIDTH - 1, 1, 1, front - 1)
  g.rect(0, front, DESK_WIDTH, 1).rect(0, front + 1, 1, 1).rect(DESK_WIDTH - 1, front + 1, 1, 1).rect(0, front + 2, DESK_WIDTH, 1)
  g.rect(0, front + 3, 2, 2).rect(DESK_WIDTH - 2, front + 3, 2, 2)
  g.fill(DARK)
  g.rect(1, front + 1, DESK_WIDTH - 2, 1).fill(WOOD)
  return g
}

/** What the little marker above someone's head says: nothing, "unhappy", or "in training". */
type Status = 'ok' | 'unhappy' | 'training'

class EmployeeSprite {
  /** Holds the character and its status marker; this is what goes on the stage. */
  readonly container = new Container()
  private readonly marker = new Graphics()
  private readonly width: number
  private readonly height: number
  private readonly body: Sprite
  private status: Status = 'ok'
  private pose: Pose | undefined
  private blinking = false
  private facingLeft: boolean
  /** The way they face at their desk, which they take up again after an outing. */
  private readonly seatedLeft: boolean

  constructor(
    private readonly look: (pose?: Pose, blink?: boolean) => Texture,
    arrangement: Arrangement,
    desk: number,
  ) {
    const texture = look()
    const seated = seat(arrangement, desk)
    // The pack's people are 21 to 24 rows tall, mostly in the size of their heads: seat them all by their feet,
    // so everyone sits at the same height and reaches the keyboard the same way.
    const y = seated.y + FEET_ROW - (texture.height - 1)
    this.container.x = Math.round(seated.x - texture.width / 2)
    this.container.y = y
    this.width = texture.width
    this.height = texture.height

    // Mirrored in place, so the character keeps the same box (and hit area) facing either way.
    const body = new Sprite(texture)
    this.body = body
    const flip = facesLeft(desk)
    this.facingLeft = flip
    this.seatedLeft = flip
    this.setPose('sit')

    this.marker.x = flip ? 1 : texture.width - 3
    this.marker.y = -9
    this.marker.visible = false
    this.container.addChild(body, this.marker)
  }

  /** Draws them standing, or in `pose` (sitting, mid-action at the desk, carrying their box), eyes open or shut; the way they face is unchanged. */
  setPose(pose?: Pose, blink = false): void {
    if (pose === this.pose && blink === this.blinking) return
    this.pose = pose
    this.blinking = blink
    this.body.texture = this.look(pose, blink)
    this.place()
  }

  /** Lines the picture up with their box, mirrored when they face left; a pose's frame is padded on both sides. */
  private place(): void {
    const left = this.body.texture.width === this.width ? 0 : POSE_PAD.left
    this.body.scale.x = this.facingLeft ? -1 : 1
    this.body.x = this.facingLeft ? this.width + left : -left
  }

  update(employee: Employee): void {
    const training = employee.training !== null
    const status: Status = training ? 'training' : employee.morale < MORALE_UNHAPPY ? 'unhappy' : 'ok'
    if (status !== this.status) {
      this.status = status
      this.drawMarker()
    }
  }

  /** Which way they are turned: the sitting character faces their desk, a leaver the way they are walking. */
  get facesLeft(): boolean {
    return this.facingLeft
  }

  /** The character's box in sprite pixels. */
  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  /** Gets up to leave: no status marker, legs and a cardboard box held in both hands, facing the way out. */
  packUp(rightwards: boolean): void {
    this.setPose('carry')
    this.marker.visible = false
    this.face(rightwards)
  }

  /** Turns to face the way they are walking; the box, held in their hands, turns with them. */
  face(rightwards: boolean): void {
    this.facingLeft = !rightwards
    this.place()
  }

  /** Turns back to face the desk they sit at. */
  faceDesk(): void {
    this.face(!this.seatedLeft)
  }

  /** Is the scene point (x, y) on this character, give or take a pixel or two? */
  hit(x: number, y: number): boolean {
    const { x: left, y: top } = this.container
    return x >= left - 2 && x <= left + this.width + 2 && y >= top - 9 && y <= top + this.height + 2
  }

  private drawMarker(): void {
    this.marker.clear()
    this.marker.visible = this.status !== 'ok'
    if (this.status === 'unhappy') {
      // a red "!" on a dark tile
      this.marker.rect(-1, -1, 4, 9).fill(0x14141f).rect(0, 0, 2, 4).fill(0xff5a6a).rect(0, 5, 2, 2).fill(0xff5a6a)
    } else if (this.status === 'training') {
      // a little blue book
      this.marker.rect(-1, -1, 7, 6).fill(0x14141f).rect(0, 0, 5, 4).fill(0x6ec6ff).rect(0, 1, 5, 1).fill(0xf4f4f4)
    }
  }
}

/** Whether a desk's screen is dark (nobody there), lit but still, or showing someone typing. */
type DeskMode = 'off' | 'idle' | 'typing'

/** A laptop or PC on a desk. Its screen and keys are drawn over the picture, so typing is seen on the desk and the person stays put. */
class Workstation {
  readonly container = new Container()
  private readonly glow = new Graphics()
  private drawn = ''

  constructor(
    private readonly spec: WorkstationSpec,
    texture: Texture,
    x: number,
    y: number,
    flip: boolean,
    private readonly desk: number,
  ) {
    this.container.addChild(new Sprite(texture), this.glow)
    if (flip) {
      this.container.scale.x = -1
      this.container.x = x + texture.width
    } else {
      this.container.x = x
    }
    this.container.y = y
  }

  update(mode: DeskMode, timeMs: number): void {
    // Desks type out of step with each other; a desk that is not typing holds one still frame.
    const step = mode === 'typing' ? Math.floor((timeMs + this.desk * 173) / TYPING_STEP_MS) : 20 + this.desk * 11
    const frame = mode === 'off' ? 'off' : `${mode}:${step}`
    if (frame === this.drawn) return
    this.drawn = frame

    const g = this.glow.clear()
    if (mode === 'off') return
    const { screen, keys } = this.spec
    if (screen.length === 0) return
    for (const { x, y, w } of screen) g.rect(x, y, w, 1).fill(SCREEN_ON)
    // The glass is a sliver, so the code is a line on every other row of it.
    const cols = Math.max(...screen.map((row) => row.w))
    const { lines, cursor } = typingScreen(step, Math.ceil(screen.length / 2), cols)
    lines.forEach((line, i) => {
      const row = screen[i * 2]!
      const length = Math.min(line.length, row.w)
      g.rect(row.x + Math.min(line.indent, row.w - length), row.y, length, 1).fill(line.color)
    })
    if (mode !== 'typing') return
    const row = screen[cursor.row * 2]!
    g.rect(row.x + Math.min(cursor.col, row.w - 1), row.y, 1, 1).fill(CURSOR)
    for (const key of pressedKeys(step, keys.length)) g.rect(keys[key]![0], keys[key]![1], 1, 1).fill(KEY_DOWN)
  }
}

/** Optional hooks for hosts other than the game itself (the Focus office). */
export interface SceneOptions {
  /** Text for the plate over the doors; defaults to the game's date. */
  label?: () => string
  /** Whether people are typing right now; defaults to "a project is running". */
  working?: () => boolean
  /**
   * Dress desks nobody sits at (a bare desk, a tucked-in chair, a mug) so they look deliberately empty.
   * Off by default: the game draws every free desk as a ready workstation.
   */
  vacancies?: boolean
  /**
   * How the desks are laid out: in rows of four (`wide`, the default) or in one deep column (`tall`). Never chosen by
   * the shape of the area, which changes with the controls around it, so the desks do not jump. The Focus office asks
   * for the column on a touch screen.
   */
  arrangement?: () => Arrangement
  /**
   * Whether it is break time. While it is, people get up and go to the coffee machine, the water cooler, the sofa, the
   * bookshelf (drawn for the occasion) or the vending machine, and go back when it is over. Off by default, so the game's office has no such outings.
   */
  breaks?: () => boolean
}

/** Someone on their way out with a box. */
interface Leaver {
  sprite: EmployeeSprite
  /** Top-left corners from the desk to the doors; see `walkoutPath`. */
  path: Point[]
  length: number
  /** Milliseconds walked so far. */
  age: number
  rightwards: boolean
}

/** Someone on a break outing: walking out to a spot, there for a while, then back to their desk. */
interface Trip {
  errand: Errand
  spot: Spot
  /** Top-left corners from the desk to the spot (see `routePath`), and the same walked the other way. */
  path: Point[]
  back: Point[]
  length: number
  phase: 'out' | 'stay' | 'back'
  /** How far along `path` they are, in sprite pixels. */
  walked: number
  /** Milliseconds at the spot so far, and what they do there. */
  stayed: number
  stay: Stay
}

/** When someone next goes out in this break, which round it is, and what they did last (so they do something else). */
interface Outing {
  round: number
  at: number
  last?: Errand
}

/** Where the bookshelf stands: its left edge, and the row below its feet (the same as the sofa's). */
const BOOKSHELF_X = 163
const BOOKSHELF_BOTTOM = 120

/** Where the office doors are (their middle and where a person's feet end up), in sprite pixels. */
const DOOR_X = 127
const DOOR_FEET = 110
/**
 * How fast people walk out, in sprite pixels a second, how far they go on each frame of their stride (so their
 * feet keep time with the floor going by), and how far from the doors they start to fade.
 */
const WALK_SPEED = 42
const STRIDE_FRAME = 4
const FADE_DISTANCE = 10

interface Popup {
  view: Container
  age: number
  startY: number
}

export class OfficeScene {
  /** Shows the rendered office; add to the stage. */
  readonly view: Sprite
  /** Screen-space layer for floating text; add to the stage above `view`. */
  readonly popups = new Container()

  private readonly app: Application
  private readonly atlas: Atlas
  private readonly getState: () => GameState
  /** Which office to show; the first one if it no longer exists. */
  private readonly getOfficeId: () => number
  private readonly onSelectEmployee: ((id: number) => void) | undefined
  private readonly options: SceneOptions
  private readonly leaving: Leaver[] = []
  private readonly trips = new Map<number, Trip>()
  private readonly outings = new Map<number, Outing>()
  /** Which break this is (they are numbered from 1, and seed the choices), and whether one was on at the last update. */
  private breakNo = 0
  private onBreak = false
  private chipLabel: string
  private readonly world = new Container()
  /** The room as drawn, one texel per sprite pixel; resized to the window on every layout. */
  private readonly target = RenderTexture.create({
    width: SCENE_W,
    height: SCENE_H,
    resolution: 1,
    scaleMode: 'nearest',
    dynamic: true,
  })
  /** Walls, floor and decor: the garage, or an office in its theme, as wide as the screen shows. */
  private readonly background = new Container()
  private readonly officeBack = new Container()
  /** What people have pinned to the partitions behind them. */
  private readonly wall = new Container()
  private readonly chairs = new Container()
  private readonly people = new Container()
  private readonly desks = new Container()
  private readonly sprites = new Map<number, EmployeeSprite>()
  /** Seating per office, so everyone keeps their desk while another office is on screen. */
  private readonly seatMaps = new Map<number, SeatMap>()
  private seats = new SeatMap()
  /** What the room currently shows, to notice a switch, a move out of the garage, or a new theme. */
  private shown: { id: number; kind: OfficeKind; theme: number } | null = null
  private readonly live: Popup[] = []
  private readonly cat = new Container()
  private readonly catBlink = new Graphics()
  private readonly dog = new Container()
  private readonly dogTail: Sprite
  private readonly dateChip = new Container()
  private readonly dateText: Text
  private readonly dateBack = new Graphics()
  private dateHeight = 0
  private builtDesks = -1
  /** Desks somebody sits at, and which of them the furniture was last dressed for (see `SceneOptions.vacancies`). */
  private occupied = new Set<number>()
  /** Desks somebody has left since the room was shown; they are cleared out rather than left as if on holiday. */
  private vacated = new Set<number>()
  private furnishedFor = ''
  /** Who the keepsakes on the wall were last pinned up for, and at which desks; null when they must go up again. */
  private hungFor: string | null = null
  /** The computers on the desks as last furnished, by desk. */
  private stations = new Map<number, Workstation[]>()
  /** Who last worked at each desk, which decides what is on it (and stays on it once they have gone). */
  private deskRoles = new Map<number, Role>()
  /** How the desks are laid out, chosen for the shape of the screen. */
  private arrangement: Arrangement = 'wide'
  private areaW = SCENE_W
  private areaH = SCENE_H
  /** The room's last row worth showing, for the desks built. */
  private bottom = SCENE_H
  /** The part of the room on screen, in scene coordinates, and its zoom. */
  private window: SceneLayout = { scale: 1, left: 0, top: ROOM_TOP, width: SCENE_W, height: SCENE_H - ROOM_TOP }
  private lastDay: number
  private time = 0
  private scale = 1

  constructor(
    app: Application,
    atlas: Atlas,
    getState: () => GameState,
    getOfficeId: () => number,
    onSelectEmployee?: (id: number) => void,
    options: SceneOptions = {},
  ) {
    this.options = options
    this.app = app
    this.atlas = atlas
    this.getState = getState
    this.getOfficeId = getOfficeId
    this.onSelectEmployee = onSelectEmployee
    this.lastDay = getState().day
    this.view = new Sprite(this.target)

    // The cat is a static sprite, so blinking is done by covering its eyes with body colour.
    this.catBlink.rect(1, 4, 2, 3).rect(5, 4, 2, 3).fill(0x1a1c2c)
    this.catBlink.visible = false
    this.cat.addChild(new Sprite(atlas.frame('cat')), this.catBlink)
    this.cat.position.set(128, 0)

    // The tail is a sprite of its own, hinged where it meets the body's shoulder so it swings
    // without pulling away from the dog.
    this.dogTail = new Sprite(atlas.dogTail)
    this.dogTail.anchor.set(0.4, 0.8)
    this.dogTail.position.set(2, 4)
    this.dog.addChild(new Sprite(atlas.dogNoTail), this.dogTail)
    this.dog.position.set(112, 0)

    this.chipLabel = options.label?.() ?? formatDateShort(getState().day)
    this.dateText = new Text({
      text: this.chipLabel,
      style: {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontWeight: '700',
        fontSize: 12,
        fill: 0xef7d57,
      },
    })
    this.dateText.anchor.set(0.5, 1)
    this.dateChip.addChild(this.dateBack, this.dateText)
    this.popups.addChild(this.dateChip)

    // People sit beside their desks, so they're drawn over them, hands reaching onto the keyboard.
    this.world.addChild(this.background, this.officeBack, this.wall, this.chairs, this.desks, this.people, this.cat, this.dog)

    // The office is drawn into a texture, so its sprites can't take clicks themselves:
    // hit-test the shown image instead.
    this.view.eventMode = 'static'
    this.view.on('pointertap', (event) => {
      const id = this.employeeAt(event.global)
      if (id !== undefined) this.onSelectEmployee?.(id)
    })
    this.view.on('pointermove', (event) => {
      this.view.cursor = this.employeeAt(event.global) === undefined ? 'default' : 'pointer'
    })
  }

  /** The employee under a screen point, if any (the one drawn last wins). */
  private employeeAt(global: PointData): number | undefined {
    const local = this.view.toLocal(global)
    const x = local.x + this.window.left
    const y = local.y + this.window.top
    let found: number | undefined
    for (const [id, sprite] of this.sprites) if (sprite.hit(x, y)) found = id
    return found
  }

  /** Where a point of the room (in scene coordinates) is on screen. */
  private toScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.window.left) * this.scale, y: (y - this.window.top) * this.scale }
  }

  /** Zooms the office to fill the given pixel area, walls and floor across its whole width; call on every resize. */
  layout(width: number, height: number): void {
    this.areaW = width
    this.areaH = height
    this.applyLayout()
  }

  private applyLayout(): void {
    // Rows of four unless the host asks for the one deep column.
    const arrangement = this.options.arrangement?.() ?? 'wide'
    if (arrangement !== this.arrangement) {
      this.arrangement = arrangement
      // Everyone keeps their desk, which has moved: their sprites are drawn again where it is now.
      this.clearSprites()
      if (this.builtDesks >= 0 && this.shown) {
        this.buildOffice(this.builtDesks, this.shown.kind) // lays the room out again, in the new arrangement
        return
      }
    }
    const next = sceneLayout(this.areaW, this.areaH, this.bottom, MIN_WIDTH[this.arrangement])
    const before = this.window
    this.window = next
    this.scale = next.scale
    if (next.width !== this.target.width || next.height !== this.target.height) this.target.resize(next.width, next.height)
    this.world.position.set(-next.left, -next.top)
    this.view.scale.set(next.scale)
    this.view.position.set(0, 0)
    // The walls and floor only reach as far as the window: draw them again when it moves or grows.
    if (next.left !== before.left || next.width !== before.width || next.height !== before.height) this.rebuildBackground()
    this.dateText.style.fontSize = Math.max(10, Math.round(4.5 * next.scale))
    this.drawDateChip()
    this.placeDateChip()
  }

  /** Lays the date's dark plate out around its text, in the style of the office clock. */
  private drawDateChip(): void {
    const padX = Math.max(4, Math.round(2.5 * this.scale))
    const padY = Math.max(2, Math.round(1.5 * this.scale))
    const width = Math.ceil(this.dateText.width) + padX * 2
    this.dateHeight = Math.ceil(this.dateText.height) + padY * 2
    this.dateText.position.set(0, -padY)
    this.dateBack
      .clear()
      .roundRect(-width / 2, -this.dateHeight, width, this.dateHeight, Math.max(2, Math.round(this.scale)))
      .fill(0x14141f)
      .stroke({ color: 0x36365a, width: 1 })
  }

  /** Puts the date over the office doors (or the garage door). */
  private placeDateChip(): void {
    const { x, y } = this.toScreen(127, 81)
    this.dateChip.position.set(Math.round(x), Math.round(Math.max(y, this.dateHeight + 6)))
  }

  /** `speed` is the game speed multiplier; 0 while paused, so employees stop typing. */
  update(dtMs: number, speed = 1): void {
    const state = this.getState()
    this.time += dtMs

    const office = getOffice(state, this.getOfficeId()) ?? state.offices[0]
    const shown = this.shown
    if (!shown || shown.id !== office.id || shown.kind !== office.kind || shown.theme !== office.theme) this.showOffice(office)
    const desks = officeSpec(office).desks
    if (desks !== this.builtDesks) this.buildOffice(desks, office.kind)
    this.syncEmployees(state, office)

    if (state.day !== this.lastDay) {
      this.lastDay = state.day
      this.spawnPopups(state)
    }
    const label = this.options.label?.() ?? formatDateShort(state.day)
    if (label !== this.chipLabel) {
      this.chipLabel = label
      this.dateText.text = label
      this.drawDateChip()
      this.placeDateChip()
    }

    // The pets idle: the cat blinks now and then, the dog gives its tail a short wag.
    this.catBlink.visible = (this.time + 1200) % 4200 < 150
    const wag = (this.time + 400) % 6500
    this.dogTail.rotation = wag < 800 ? Math.sin((wag / 800) * Math.PI * 3) * 0.35 : 0

    const working = this.options.working ? this.options.working() : speed > 0 && office.project !== null && !state.gameOver
    const people = new Map(state.employees.map((e) => [e.id, e]))
    const modes = new Map<number, DeskMode>()
    for (const [id, sprite] of this.sprites) {
      const employee = people.get(id)
      if (!employee) continue
      sprite.update(employee)
      // Each person types, pauses to think, sips or stretches in their own rhythm; while the game is paused
      // everyone sits still. Their screen only moves while they are actually typing.
      const moment = speed > 0 ? momentAt(id, this.time, working && employee.training === null) : { pose: undefined, typing: false }
      // Someone out on a break is posed by their outing (below), not by what they would be doing at their desk.
      if (!this.trips.has(id)) sprite.setPose(moment.pose ?? 'sit', speed > 0 && blinkingAt(id, this.time))
      const desk = this.seats.deskFor(id)
      if (desk !== undefined) modes.set(desk, moment.typing ? 'typing' : 'idle')
    }
    for (const [desk, stations] of this.stations) for (const station of stations) station.update(modes.get(desk) ?? 'off', this.time)
    if (this.options.breaks) this.updateBreaks(dtMs, this.options.breaks())
    this.updatePopups(dtMs, speed)
    this.updateLeaving(dtMs)

    this.app.renderer.render({ container: this.world, target: this.target })
  }

  /**
   * Sends someone out the door with a box. Call it *before* removing them from the game state: once
   * they are gone from the state their desk sprite is removed at once, and there is nothing to animate.
   */
  leave(id: number): void {
    const sprite = this.sprites.get(id)
    if (!sprite) return
    const desk = this.seats.deskFor(id)
    // From here the sprite is ours: the seating sync must not destroy it, nor a click select it.
    this.sprites.delete(id)
    const { width, height } = sprite.size
    const start = { x: sprite.container.x, y: sprite.container.y }
    const doorLeft = Math.round(DOOR_X - width / 2)
    // Out on a break, they carry on from where they are rather than starting from their desk.
    const trip = this.trips.get(id)
    this.trips.delete(id)
    this.outings.delete(id)
    const path = trip
      ? pathToDoors(trip.path, trip.walked, { start, size: { width, height }, doorX: DOOR_X, doorFeet: DOOR_FEET })
      : desk === undefined
        ? [start, { x: doorLeft, y: DOOR_FEET - height }]
        : walkoutPath({
            arrangement: this.arrangement,
            desk,
            start,
            size: { width, height },
            window: this.window,
            doorX: DOOR_X,
            doorFeet: DOOR_FEET,
          })
    // They face the way their first sideways step goes, and keep it while walking up or down the aisle; with no
    // sideways step at all they keep the way they were sitting.
    const sideways = path.map((point, i) => (i === 0 ? 0 : Math.sign(point.x - path[i - 1]!.x))).find((dx) => dx !== 0)
    const rightwards = sideways === undefined ? !sprite.facesLeft : sideways > 0
    sprite.packUp(rightwards)
    this.leaving.push({ sprite, path, length: pathLength(path), age: 0, rightwards })
  }

  /** Walks everyone who is leaving along their path, stepping foot after foot, and fades them out at the doors. */
  private updateLeaving(dtMs: number): void {
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const leaver = this.leaving[i]!
      leaver.age += dtMs
      const walked = (leaver.age / 1000) * WALK_SPEED
      const done = walked >= leaver.length
      const at = pointAlong(leaver.path, walked)
      if (at.dx !== 0 && at.dx > 0 !== leaver.rightwards) {
        leaver.rightwards = at.dx > 0
        leaver.sprite.face(leaver.rightwards)
      }
      // Only the legs move: lifting the whole body with each step read as hopping.
      leaver.sprite.setPose(WALK_CYCLE[Math.floor(walked / STRIDE_FRAME) % WALK_CYCLE.length])
      const view = leaver.sprite.container
      view.x = Math.round(at.x)
      view.y = Math.round(at.y)
      view.alpha = Math.min(1, Math.max(0, (leaver.length - walked) / FADE_DISTANCE))
      if (done) {
        view.destroy({ children: true })
        this.leaving.splice(i, 1)
      }
    }
  }

  /** Is the spot in the part of the room on screen, for someone `width` wide? Nobody walks to the vending machine in a cropped-off margin. */
  private inView(spot: Spot, width: number): boolean {
    const left = Math.round(spot.x - width / 2)
    return left >= this.window.left + 1 && left + width <= this.window.left + this.window.width - 1
  }

  /**
   * Breaks: while one is on, everyone at their desk gets up in their own time, goes to a spot nobody else is at (the
   * coffee machine, a cooler, the sofa, the bookshelf, a place to buy a snack), does what is done there and comes back,
   * round after round; when the break is over, whoever is out turns back at once.
   */
  private updateBreaks(dtMs: number, onBreak: boolean): void {
    if (onBreak !== this.onBreak) {
      this.onBreak = onBreak
      if (onBreak) this.breakNo += 1
      this.outings.clear()
    }

    for (const [id, trip] of this.trips) {
      const sprite = this.sprites.get(id)
      if (sprite) this.advanceTrip(id, sprite, trip, dtMs, onBreak)
      else this.trips.delete(id) // they left, or were seated again somewhere else
    }
    if (!onBreak) return

    for (const [id, sprite] of this.sprites) {
      if (this.trips.has(id)) continue
      let outing = this.outings.get(id)
      if (!outing) {
        outing = { round: 0, at: nextOutAt(id, this.breakNo, 0, this.time) }
        this.outings.set(id, outing)
      }
      // Nothing free to go to (everything is taken, or off screen): try again shortly.
      if (this.time >= outing.at && !this.startTrip(id, sprite, outing)) outing.at = this.time + 3000
    }
  }

  /** Sends someone from their desk to a free spot, if there is one in view. */
  private startTrip(id: number, sprite: EmployeeSprite, outing: Outing): boolean {
    const desk = this.seats.deskFor(id)
    if (desk === undefined) return false
    const { width, height } = sprite.size
    const taken = [...this.trips.values()].map((trip) => trip.spot)
    const free = SPOTS.filter((spot) => spotFree(spot, taken) && this.inView(spot, width))
    const errand = chooseErrand(id, this.breakNo, outing.round, [...new Set(free.map((spot) => spot.errand))], outing.last)
    if (errand === undefined) return false
    const spot = chooseSpot(id, this.breakNo, outing.round, free.filter((candidate) => candidate.errand === errand))
    if (!spot) return false

    const start = { x: sprite.container.x, y: sprite.container.y }
    const path = routePath(
      { arrangement: this.arrangement, desk, start, size: { width, height }, window: this.window, doorX: DOOR_X, doorFeet: DOOR_FEET },
      { x: Math.round(spot.x - width / 2), y: spot.feet - height },
    )
    this.trips.set(id, {
      errand,
      spot,
      path,
      back: [...path].reverse(),
      length: pathLength(path),
      phase: 'out',
      walked: 0,
      stayed: 0,
      stay: stayFor(id, this.breakNo, outing.round, errand),
    })
    return true
  }

  /** Moves one person along their outing by `dtMs` and draws them: striding, or at the spot doing what is done there. */
  private advanceTrip(id: number, sprite: EmployeeSprite, trip: Trip, dtMs: number, onBreak: boolean): void {
    const step = (dtMs / 1000) * WALK_SPEED
    if (trip.phase === 'out') {
      trip.walked = Math.min(trip.length, trip.walked + step)
      if (!onBreak) trip.phase = 'back'
      else if (trip.walked >= trip.length) trip.phase = 'stay'
    } else if (trip.phase === 'stay') {
      trip.stayed += dtMs
      if (!onBreak || trip.stayed >= trip.stay.total) trip.phase = 'back'
    } else {
      trip.walked = Math.max(0, trip.walked - step)
    }

    const view = sprite.container
    const blink = blinkingAt(id, this.time)
    if (trip.phase === 'back' && trip.walked <= 0) {
      // Home: back in the chair, as they were.
      this.trips.delete(id)
      const outing = this.outings.get(id)
      if (outing && onBreak) {
        outing.round += 1
        outing.last = trip.errand
        outing.at = nextOutAt(id, this.breakNo, outing.round, this.time)
      }
      view.x = trip.path[0]!.x
      view.y = trip.path[0]!.y
      sprite.faceDesk()
      sprite.setPose('sit', blink)
      return
    }

    if (trip.phase === 'stay') {
      const end = trip.path[trip.path.length - 1]!
      view.x = end.x
      view.y = end.y
      sprite.face(trip.spot.rightwards)
      sprite.setPose(poseAtSpot(trip.stay, trip.stayed), blink)
      return
    }
    const out = trip.phase === 'out'
    const travelled = out ? trip.walked : trip.length - trip.walked
    const at = pointAlong(out ? trip.path : trip.back, travelled)
    if (at.dx !== 0) sprite.face(at.dx > 0)
    sprite.setPose(STEP_CYCLE[Math.floor(travelled / STRIDE_FRAME) % STEP_CYCLE.length], blink)
    view.x = Math.round(at.x)
    view.y = Math.round(at.y)
  }

  /** Is anyone still on their way out? Hosts wait for this before reporting the day. */
  get leavingCount(): number {
    return this.leaving.length
  }

  destroy(): void {
    for (const popup of this.live) popup.view.destroy({ children: true })
    this.live.length = 0
    this.world.destroy({ children: true })
    this.view.destroy()
    this.popups.destroy({ children: true })
    this.target.destroy(true)
  }

  /** Switches the room to another office (or redecorates this one): new walls and floor, and its own people at their desks. */
  private showOffice(office: Office): void {
    this.clearSprites()
    this.shown = { id: office.id, kind: office.kind, theme: office.theme }
    this.rebuildBackground()

    let seats = this.seatMaps.get(office.id)
    if (!seats) {
      seats = new SeatMap()
      this.seatMaps.set(office.id, seats)
    }
    this.seats = seats
    this.builtDesks = -1
    this.occupied = new Set()
    this.vacated = new Set()
    this.deskRoles = new Map()
  }

  /** Takes everyone off the stage (they are drawn again at their desks); outings in progress are forgotten. */
  private clearSprites(): void {
    for (const sprite of this.sprites.values()) sprite.container.destroy({ children: true })
    this.sprites.clear()
    this.trips.clear()
    this.outings.clear()
  }

  /** Draws the shown room's walls, floor and decor again, across the window as it is now. */
  private rebuildBackground(): void {
    for (const child of this.background.removeChildren()) child.destroy({ children: true })
    if (!this.shown) return
    this.background.addChild(this.shown.kind === 'garage' ? this.buildGarage() : this.buildBackground(this.shown.theme))
  }

  /** The window's edges in scene coordinates: the walls and floor have to reach this far. */
  private reach(): { left: number; right: number; bottom: number } {
    const { left, top, width, height } = this.window
    return { left, right: left + width, bottom: Math.max(top + height, FLOOR_TOP) }
  }

  /**
   * A garage: cinder-block walls, a roll-up door, a workbench under a pegboard of tools, shelves of junk,
   * an old sofa, two bare bulbs and a concrete floor. Drawn from the artwork's palette.
   */
  private buildGarage(): Container {
    const { atlas } = this
    const bg = new Container()
    const { left, right, bottom } = this.reach()
    const width = right - left
    // Pattern repeats start a period or two to the left of the window, lined up with the artwork's own.
    const from = (period: number) => Math.floor(left / period) * period - period

    const g = new Graphics()
    // Cinder blocks, staggered every other row, wall to wall.
    g.rect(left, WALL_TOP, width, FLOOR_TOP - WALL_TOP).fill(BLOCK)
    for (let y = WALL_TOP + 8, row = 0; y < FLOOR_TOP; y += 8, row++) {
      g.rect(left, y, width, 1)
      for (let x = from(16) + (row % 2 === 0 ? 8 : 0); x < right; x += 16) g.rect(x, y - 7, 1, 7)
    }
    g.fill(MORTAR)
    g.rect(left, WALL_TOP, width, 3).rect(left, FLOOR_TOP - 2, width, 2).fill(DARK)

    // The roll-up door, slats and a handle.
    g.rect(92, 58, 72, FLOOR_TOP - 58).fill(DARK)
    g.rect(95, 61, 66, FLOOR_TOP - 61).fill(WHITE)
    for (let y = 65; y < FLOOR_TOP; y += 5) g.rect(95, y, 66, 1)
    g.fill(BLOCK)
    g.rect(124, 104, 8, 2).fill(DARK)

    // Pegboard with tools over the workbench: a hammer, a wrench, a saw.
    g.rect(14, 64, 44, 28).fill(WOOD)
    for (let y = 67; y < 90; y += 4) for (let x = 17; x < 56; x += 4) g.rect(x, y, 1, 1)
    g.fill(RUST)
    g.rect(20, 70, 2, 14).fill(SAND).rect(17, 68, 8, 3).fill(MORTAR)
    g.rect(30, 69, 2, 15).rect(28, 68, 6, 3).fill(BLOCK)
    g.rect(40, 70, 12, 7).fill(BLOCK).rect(40, 77, 4, 6).fill(DARK)

    // Shelves of boxes and paint tins.
    g.rect(206, 60, 2, 50).rect(246, 60, 2, 50).fill(MORTAR)
    g.rect(204, 72, 46, 2).rect(204, 88, 46, 2).rect(204, 104, 46, 2).fill(DARK)
    g.rect(210, 62, 12, 10).rect(226, 66, 9, 6).rect(212, 94, 14, 10).fill(SAND)
    g.rect(238, 64, 7, 8).rect(228, 96, 6, 8).rect(236, 97, 6, 7).fill(0x3b5dc9)
    g.rect(214, 78, 10, 10).rect(230, 80, 14, 8).fill(WOOD)

    // Two bare bulbs on their cords.
    for (const x of [64, 186]) g.rect(x, WALL_TOP + 3, 1, 9).fill(DARK).rect(x - 1, WALL_TOP + 12, 3, 3).fill(SAND)

    // A concrete floor in slabs, with an old oil stain.
    g.rect(left, FLOOR_TOP, width, bottom - FLOOR_TOP).fill(BLOCK)
    for (let x = from(64); x < right; x += 64) g.rect(x, FLOOR_TOP, 1, bottom - FLOOR_TOP)
    for (let y = 150; y < bottom; y += 40) g.rect(left, y, width, 1)
    g.fill(MORTAR)
    g.ellipse(232, 158, 12, 4).fill({ color: MORTAR, alpha: 0.6 })
    bg.addChild(g)

    const decor: readonly [FrameName, number, number, boolean?][] = [
      ['tableLong', 15, 103],
      ['picture', 20, 96],
      ['mug', 46, 97],
      ['whiteboard', 64, 64],
      ['binBlue', 76, 98],
      ['sofaGray', 168, 97],
      ['papers', 192, 97],
    ]
    for (const [name, x, y, flip] of decor) bg.addChild(placed(atlas.frame(name), x, y, flip))
    return bg
  }

  /** An office: a plain wall wall to wall, and its theme's floor tiles as far as the window reaches. */
  private buildBackground(theme: number): Container {
    const { atlas } = this
    const bg = new Container()
    const { left, right, bottom } = this.reach()

    const wall = placed(atlas.wallStrip, left, WALL_TOP)
    wall.width = right - left
    bg.addChild(wall)

    const tile = atlas.floorTile(theme)
    // Tiles stay lined up with the artwork's own, which start at x = 0.
    for (let y = FLOOR_TOP; y < bottom; y += tile.height) {
      for (let x = Math.floor(left / tile.width) * tile.width; x < right; x += tile.width) bg.addChild(placed(tile, x, y))
    }

    const decor: readonly [FrameName, number, number, boolean?][] = [
      ['vending', 1, 85],
      ['waterCooler', 26, 102],
      ['windowNote', 33, 80],
      ['counter', 36, 103],
      ['mug', 39, 104],
      ['coffeeMachine', 50, 100],
      ['calendar', 66, 90],
      ['plant', 91, 97],
      ['doorHalf', 111, 82],
      ['doorHalf', 127, 82, true],
      ['plant', 148, 97],
      [THEME_SOFAS[theme % THEME_SOFAS.length], 186, 104],
      ['windowPlain', 199, 80],
      ['waterCooler', 221, 103],
      ['snackCabinet', 231, 89],
    ]
    for (const [name, x, y, flip] of decor) bg.addChild(placed(atlas.frame(name), x, y, flip))
    // The bookshelf stands between the plant and the sofa; only a host with breaks has anyone to read from it.
    if (this.options.breaks) {
      const shelf = new Graphics()
      for (const { x, y, w, h, color } of bookshelfRects()) shelf.rect(x, y, w, h).fill(color)
      shelf.position.set(BOOKSHELF_X, BOOKSHELF_BOTTOM - BOOKSHELF_HEIGHT)
      bg.addChild(shelf)
    }
    return bg
  }

  /** (Re)builds partitions, chairs and desks for the given number of desks; a garage has no partitions. */
  private buildOffice(desks: number, kind: OfficeKind): void {
    const { atlas } = this
    for (const child of this.officeBack.removeChildren()) child.destroy()

    for (let p = 0; p < Math.ceil(desks / 2) && kind === 'office'; p++) {
      const [px, py] = partitionAt(this.arrangement, p)
      this.officeBack.addChild(placed(atlas.frame('partition'), px, py))
      if (desks > 2 * p + 1) {
        this.officeBack.addChild(placed(atlas.frame('deskPole'), px + 37, py + 3))
      }
    }

    this.builtDesks = desks
    for (const child of this.wall.removeChildren()) child.destroy()
    this.hungFor = null
    this.furnishDesks(desks)
    this.setBottom(roomBottom(this.arrangement, desks))
    // People stay at their desks: only the furniture around them was rebuilt.
  }

  /** Puts a chair and a desk with its computer at every desk; with `vacancies`, empty ones are dressed as such. */
  private furnishDesks(desks: number): void {
    const { atlas } = this
    for (const layer of [this.chairs, this.desks]) {
      for (const child of layer.removeChildren()) child.destroy({ children: true })
    }
    this.stations = new Map()
    this.furnishedFor = this.furnishKey()

    for (let i = 0; i < desks; i++) {
      const [px, py] = partitionAt(this.arrangement, i >> 1)
      const right = (i & 1) === 1
      const vacancy = this.options.vacancies && !this.occupied.has(i) ? vacancyFor(i, this.vacated.has(i)) : null
      const chair = atlas.frame(CHAIRS[i % CHAIRS.length])
      const tuck = vacancy && chairTucked(vacancy) ? (right ? -CHAIR_TUCK : CHAIR_TUCK) : 0
      this.chairs.addChild(placed(chair, px + chairX(right, chair.width) + tuck, py + CHAIR_TOP, right))

      const deskX = px + (right ? 40 : 19)
      this.desks.addChild(placed(atlas.frame(right ? 'deskRight' : 'deskLeft'), deskX, py + 11))
      if (this.shown?.kind === 'garage' || !partitionInFront(this.arrangement, i >> 1, desks)) {
        this.desks.addChild(freestandingDesk(right)).position.set(deskX, py + 11)
      }
      if (!vacancy || hasComputer(vacancy)) {
        const stations: Workstation[] = []
        for (const kind of workstationsFor(this.deskRoles.get(i), i)) {
          const { gap, width, top } = WORKSTATIONS[kind]
          // Against the edge of the desk nearest the person, whichever side that is.
          const x = deskX + (right ? DESK_WIDTH - gap - width : gap)
          const station = new Workstation(WORKSTATIONS[kind], atlas.workstation(kind), x, py + top, right, i)
          stations.push(station)
          this.desks.addChild(station.container)
        }
        this.stations.set(i, stations)
      }
      if (vacancy) this.dressVacantDesk(vacancy, deskX, py, right)
    }
  }

  /** Whatever is left on a desk nobody sits at, by what kind of vacancy it is. */
  private dressVacantDesk(vacancy: Vacancy, deskX: number, py: number, right: boolean): void {
    const { atlas } = this
    const frame = (name: FrameName, x: number, y: number) => this.desks.addChild(placed(atlas.frame(name), deskX + x, py + y))
    if (vacancy === 'away') frame('mug', right ? 0 : 9, 22)
    else if (vacancy === 'bare') frame('towerRed', 3, 19)
    else {
      frame('papers', right ? 9 : 3, 17)
      frame('mug', right ? 1 : 8, 22)
    }
  }

  /** What the desks are furnished for, as a string to compare: who has worked at each, and (when dressed by occupancy) who is there now. */
  private furnishKey(): string {
    const occupancy = this.options.vacancies ? [...this.occupied].sort((a, b) => a - b).join(',') : ''
    const roles = [...this.deskRoles].sort(([a], [b]) => a - b).map(([desk, role]) => `${desk}${role[0]}`).join(',')
    return `${occupancy}|${roles}`
  }

  /** Fits the room to the rows of desks built so far and parks the pets just below them. */
  private setBottom(bottom: number): void {
    this.bottom = bottom
    this.cat.y = bottom - 26
    this.dog.y = bottom - 14
    this.applyLayout()
    // A new office kind or theme with the same window still needs its walls drawn.
    this.rebuildBackground()
  }

  /**
   * Seats the office's new people at the first free desk and clears the seats of leavers; everyone else
   * stays put. Anyone seated without a sprite (just hired, or the office was just switched to) gets one.
   */
  private syncEmployees(state: GameState, office: Office): void {
    const ids = staffOf(state, office).map((e) => e.id)
    const { left } = this.seats.sync(ids, this.builtDesks)
    for (const id of left) {
      this.sprites.get(id)?.container.destroy({ children: true })
      this.sprites.delete(id)
    }
    for (const id of ids) {
      const desk = this.seats.deskFor(id)
      if (desk === undefined || this.sprites.has(id)) continue
      const sprite = new EmployeeSprite((pose, blink) => this.atlas.character(id, pose, blink), this.arrangement, desk)
      this.sprites.set(id, sprite)
      this.people.addChild(sprite.container)
    }

    for (const { id, role } of staffOf(state, office)) {
      const desk = this.seats.deskFor(id)
      if (desk !== undefined) this.deskRoles.set(desk, role)
    }
    if (this.options.vacancies) {
      const before = this.occupied
      this.occupied = new Set(ids.flatMap((id) => this.seats.deskFor(id) ?? []))
      for (const desk of before) if (!this.occupied.has(desk)) this.vacated.add(desk)
      for (const desk of this.occupied) this.vacated.delete(desk)
    }
    if (this.furnishKey() !== this.furnishedFor) this.furnishDesks(this.builtDesks)

    // A garage has no partitions to pin anything to.
    const pinned = this.shown?.kind === 'office' ? ids : []
    const hung = pinned.map((id) => `${id}@${this.seats.deskFor(id) ?? ''}`).join(',')
    if (hung !== this.hungFor) {
      this.hungFor = hung
      this.hangKeepsakes(pinned)
    }
  }

  /** Pins up each seated person's keepsake, if they have one, on the partition behind their desk. */
  private hangKeepsakes(ids: readonly number[]): void {
    for (const child of this.wall.removeChildren()) child.destroy()
    for (const id of ids) {
      const desk = this.seats.deskFor(id)
      const keepsake = keepsakeFor(id)
      if (desk === undefined || !keepsake) continue
      const [px, py] = partitionAt(this.arrangement, desk >> 1)
      const texture = this.atlas.frame(keepsake)
      this.wall.addChild(placed(texture, px + keepsakeX((desk & 1) === 1, texture.width), py + KEEPSAKE_TOP))
    }
  }

  private spawnPopups(state: GameState): void {
    for (const work of state.dayWork) {
      if (this.live.length >= MAX_POPUPS) return
      const desk = this.seats.deskFor(work.employeeId)
      if (desk === undefined) continue

      let total = 0
      let top: Discipline = 'engineering'
      for (const d of DISCIPLINES) {
        total += work.points[d]
        if (work.points[d] > work.points[top]) top = d
      }
      const { x, y } = seat(this.arrangement, desk)
      const { x: screenX, y: screenY } = this.toScreen(x, y - 2)
      if (total >= 1) this.addPopup(this.numberPopup(Math.round(total), work.fixing ? BUG_RED : colorNumber(DISCIPLINE_COLORS[top]), work.fixing), screenX, screenY)
    }
  }

  /** "+12" in a discipline's colour; while fixing bugs, red with a bug in front of it. */
  private numberPopup(points: number, color: number, withBug: boolean): Container {
    const view = new Container()
    const text = new Text({
      text: `+${points}`,
      style: {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontWeight: '700',
        fontSize: Math.max(15, Math.round(7 * this.scale)),
        fill: color,
        stroke: { color: INK, width: Math.max(3, Math.round(1.7 * this.scale)) },
      },
    })
    text.anchor.set(0.5, 1)
    view.addChild(text)
    if (withBug) {
      const bug = bugGraphic()
      bug.scale.set(Math.max(2, this.scale))
      const gap = bug.scale.x * 2
      // Centre the pair: the bug on the left, the number on the right, both resting on the same line.
      const width = bug.width + gap + text.width
      bug.position.set(-width / 2 + bug.width / 2, -text.height * 0.15)
      text.x = width / 2 - text.width / 2
      view.addChild(bug)
    }
    return view
  }

  private addPopup(view: Container, x: number, y: number): void {
    view.position.set(x, y)
    this.popups.addChild(view)
    this.live.push({ view, age: 0, startY: y })
  }

  /** Popups live shorter at higher speeds so they don't pile up. */
  private updatePopups(dtMs: number, speed: number): void {
    const lifetime = POPUP_MS / Math.sqrt(Math.max(speed, 1))
    for (let i = this.live.length - 1; i >= 0; i--) {
      const popup = this.live[i]
      popup.age += dtMs
      const t = popup.age / lifetime
      if (t >= 1) {
        popup.view.destroy({ children: true })
        this.live.splice(i, 1)
        continue
      }
      popup.view.y = popup.startY - 14 * this.scale * (1 - (1 - t) ** 2)
      popup.view.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
    }
  }
}
