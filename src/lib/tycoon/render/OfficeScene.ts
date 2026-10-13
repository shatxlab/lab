import { Container, Graphics, RenderTexture, Sprite, Text, type Application, type PointData, type Texture } from 'pixi.js'
import { MORALE_UNHAPPY } from '@/lib/tycoon/sim/balance'
import { getOffice, officeSpec, staffOf } from '@/lib/tycoon/sim/offices'
import { DISCIPLINES, type Discipline, type Employee, type GameState, type Office, type OfficeKind } from '@/lib/tycoon/sim/types'
import { DISCIPLINE_COLORS } from '@/lib/tycoon/theme'
import type { Atlas, FrameName } from './atlas'
import { arrange, MIN_WIDTH, partitionAt, ROOM_TOP, roomBottom, sceneLayout, type Arrangement, type SceneLayout } from '../render-support/layout'
import { SeatMap } from '../render-support/seats'
import { formatDateShort } from '@/lib/tycoon/format'

/** Size of the room's artwork in sprite pixels. Walls and floor go on beyond it as far as the screen needs. */
export const SCENE_W = 256
export const SCENE_H = 224

const WALL_TOP = ROOM_TOP
const FLOOR_TOP = 112
const MAX_POPUPS = 24
const POPUP_MS = 1100
const BOB_MS = 250
/** Bug-fixing popups are red, with a little bug beside the number. */
const BUG_RED = 0xff5a6a
const INK = 0x14141f

const CHAIRS: readonly FrameName[] = ['chairWhite', 'chairBlue', 'chairGreen', 'chairOrange', 'chairRed', 'chairGray']
const FLAGS: readonly FrameName[] = ['flagUs', 'flagIndia', 'flagUk']
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

/** Where a workstation's occupant sits in an arrangement: horizontal centre and top of the head. */
function seat(arrangement: Arrangement, index: number): { x: number; y: number } {
  const [px, py] = partitionAt(arrangement, index >> 1)
  return { x: px + (index & 1 ? 59.5 : 14.5), y: py + 5 }
}

/** The sprites face right; whoever sits on the right of a partition has their computer to the left. */
const facesLeft = (index: number): boolean => (index & 1) === 1

/** A 7x7 pixel ladybug with its bottom centre at the origin, so it squashes onto the spot where it sat. */
function bugGraphic(): Graphics {
  const g = new Graphics()
  g.rect(2, 0, 1, 1).rect(4, 0, 1, 1).rect(2, 1, 3, 1).fill(INK) // antennae and head
  g.rect(0, 2, 1, 1).rect(6, 2, 1, 1).rect(0, 4, 1, 1).rect(6, 4, 1, 1).rect(3, 2, 1, 5).fill(INK) // legs and wing seam
  g.rect(1, 2, 2, 4).rect(4, 2, 2, 4).rect(2, 6, 1, 1).rect(4, 6, 1, 1).fill(BUG_RED) // wings
  g.rect(1, 3, 1, 1).rect(5, 4, 1, 1).fill(INK) // spots
  g.pivot.set(3.5, 7)
  return g
}

/** What the little marker above someone's head says: nothing, "unhappy", or "in training". */
type Status = 'ok' | 'unhappy' | 'training'

class EmployeeSprite {
  /** Holds the character and its status marker; this is what goes on the stage. */
  readonly container = new Container()
  private readonly marker = new Graphics()
  private readonly baseY: number
  private readonly phase: number
  private readonly width: number
  private readonly height: number
  private readonly body: Sprite
  private status: Status = 'ok'

  constructor(texture: Texture, arrangement: Arrangement, desk: number, id: number) {
    const { x, y } = seat(arrangement, desk)
    this.container.x = Math.round(x - texture.width / 2)
    this.container.y = y
    this.baseY = y
    this.phase = id * 97
    this.width = texture.width
    this.height = texture.height

    // Mirrored in place, so the character keeps the same box (and hit area) facing either way.
    const body = new Sprite(texture)
    this.body = body
    const flip = facesLeft(desk)
    if (flip) {
      body.scale.x = -1
      body.x = texture.width
    }

    this.marker.x = flip ? 1 : texture.width - 3
    this.marker.y = -9
    this.marker.visible = false
    this.container.addChild(body, this.marker)
  }

  update(timeMs: number, working: boolean, employee: Employee): void {
    const training = employee.training !== null
    const up = working && !training && Math.floor((timeMs + this.phase) / BOB_MS) % 2 === 0
    this.container.y = this.baseY + (up ? -1 : 0)

    const status: Status = training ? 'training' : employee.morale < MORALE_UNHAPPY ? 'unhappy' : 'ok'
    if (status !== this.status) {
      this.status = status
      this.drawMarker()
    }
  }

  /** The character's box in sprite pixels. */
  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  /** Gets up to leave: no status marker, a cardboard box in hand, facing the way out. */
  packUp(rightwards: boolean): void {
    this.marker.visible = false
    this.body.scale.x = rightwards ? 1 : -1
    this.body.x = rightwards ? 0 : this.width
    const box = new Graphics()
    box.rect(0, 0, 7, 6).fill(0xa8743a).rect(0, 0, 7, 2).fill(0xc8935a).rect(3, 0, 1, 2).fill(0xe8c08a)
    box.position.set(rightwards ? this.width - 3 : -4, Math.round(this.height * 0.45))
    this.container.addChild(box)
  }

  /** Is the scene point (x, y) on this character, give or take a pixel or two? */
  hit(x: number, y: number): boolean {
    const left = this.container.x
    return x >= left - 2 && x <= left + this.width + 2 && y >= this.baseY - 9 && y <= this.baseY + this.height + 2
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

/** Optional hooks for hosts other than the game itself (the Focus office). */
export interface SceneOptions {
  /** Text for the plate over the doors; defaults to the game's date. */
  label?: () => string
  /** Whether people are typing right now; defaults to "a project is running". */
  working?: () => boolean
}

/** Someone on their way out with a box. */
interface Leaver {
  sprite: EmployeeSprite
  age: number
  fromX: number
  fromY: number
  toX: number
  toY: number
}

/** Where the office doors are (their middle and where a person's feet end up), in sprite pixels. */
const DOOR_X = 127
const DOOR_FEET = 110
const LEAVE_MS = 2600

interface Popup {
  view: Container
  /** A number that floats up and fades, or a bug that gets squashed where it stands. */
  kind: 'rise' | 'squash'
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
    this.world.addChild(this.background, this.officeBack, this.chairs, this.desks, this.people, this.cat, this.dog)

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
    // A phone held upright gets the desks in one deep column; anything wider keeps rows of four.
    const { arrangement } = arrange(this.areaW, this.areaH, Math.max(this.builtDesks, 1))
    if (arrangement !== this.arrangement) {
      this.arrangement = arrangement
      // Everyone keeps their desk, which has moved: their sprites are drawn again where it is now.
      for (const sprite of this.sprites.values()) sprite.container.destroy({ children: true })
      this.sprites.clear()
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
    for (const [id, sprite] of this.sprites) {
      const employee = people.get(id)
      if (employee) sprite.update(this.time, working, employee)
    }
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
    // From here the sprite is ours: the seating sync must not destroy it, nor a click select it.
    this.sprites.delete(id)
    const { width, height } = sprite.size
    const fromX = sprite.container.x
    const toX = Math.round(DOOR_X - width / 2)
    sprite.packUp(toX >= fromX)
    this.leaving.push({ sprite, age: 0, fromX, fromY: sprite.container.y, toX, toY: DOOR_FEET - height })
  }

  /** Walks everyone who is leaving toward the door, hopping a little, and fades them out at the end. */
  private updateLeaving(dtMs: number): void {
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const leaver = this.leaving[i]!
      leaver.age += dtMs
      const t = Math.min(1, leaver.age / LEAVE_MS)
      const eased = t * t * (3 - 2 * t)
      const hop = t < 1 ? -Math.abs(Math.sin(leaver.age / 110)) * 1.5 : 0
      const view = leaver.sprite.container
      view.x = Math.round(leaver.fromX + (leaver.toX - leaver.fromX) * eased)
      view.y = Math.round(leaver.fromY + (leaver.toY - leaver.fromY) * eased + hop)
      view.alpha = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2)
      if (t >= 1) {
        view.destroy({ children: true })
        this.leaving.splice(i, 1)
      }
    }
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
    for (const sprite of this.sprites.values()) sprite.container.destroy({ children: true })
    this.sprites.clear()
    this.shown = { id: office.id, kind: office.kind, theme: office.theme }
    this.rebuildBackground()

    let seats = this.seatMaps.get(office.id)
    if (!seats) {
      seats = new SeatMap()
      this.seatMaps.set(office.id, seats)
    }
    this.seats = seats
    this.builtDesks = -1
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
      ['printer', 20, 96],
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
    return bg
  }

  /** (Re)builds partitions, chairs and desks for the given number of desks; a garage has no partitions. */
  private buildOffice(desks: number, kind: OfficeKind): void {
    const { atlas } = this
    for (const layer of [this.officeBack, this.chairs, this.desks]) {
      for (const child of layer.removeChildren()) child.destroy()
    }

    for (let p = 0; p < Math.ceil(desks / 2) && kind === 'office'; p++) {
      const [px, py] = partitionAt(this.arrangement, p)
      this.officeBack.addChild(placed(atlas.frame('partition'), px, py))
      if (desks > 2 * p + 1) {
        this.officeBack.addChild(placed(atlas.frame('deskPole'), px + 37, py + 3))
        this.officeBack.addChild(placed(atlas.frame(FLAGS[p >> 1]), px + 63, py + 5))
      }
    }

    for (let i = 0; i < desks; i++) {
      const [px, py] = partitionAt(this.arrangement, i >> 1)
      const right = (i & 1) === 1
      const chair = atlas.frame(CHAIRS[i % CHAIRS.length])
      this.chairs.addChild(placed(chair, px + (right ? 56 : 7), py + 7, right))
      this.desks.addChild(
        placed(atlas.frame(right ? 'deskRight' : 'deskLeft'), px + (right ? 40 : 19), py + 11),
        placed(atlas.frame('computer'), px + (right ? 41 : 20), py + 6, right),
      )
    }
    this.builtDesks = desks
    this.setBottom(roomBottom(this.arrangement, desks))
    // People stay at their desks: only the furniture around them was rebuilt.
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
      const sprite = new EmployeeSprite(this.atlas.character(id), this.arrangement, desk, id)
      this.sprites.set(id, sprite)
      this.people.addChild(sprite.container)
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
      if (total >= 1) this.addPopup(this.numberPopup(Math.round(total), work.fixing ? BUG_RED : colorNumber(DISCIPLINE_COLORS[top]), work.fixing), 'rise', screenX, screenY)
      if (work.bugs > 0 && this.live.length < MAX_POPUPS) {
        const bug = bugGraphic()
        bug.scale.set(this.scale * 1.5)
        const view = new Container()
        view.addChild(bug)
        this.addPopup(view, 'squash', screenX + 9 * this.scale, screenY)
      }
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

  private addPopup(view: Container, kind: Popup['kind'], x: number, y: number): void {
    view.position.set(x, y)
    this.popups.addChild(view)
    this.live.push({ view, kind, age: 0, startY: y })
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
      if (popup.kind === 'rise') {
        popup.view.y = popup.startY - 14 * this.scale * (1 - (1 - t) ** 2)
        popup.view.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      } else {
        // The bug scuttles a moment, then gets flattened and fades.
        const squash = Math.min(Math.max((t - 0.3) / 0.2, 0), 1)
        popup.view.scale.set(1 + 0.5 * squash, 1 - 0.75 * squash)
        popup.view.x += squash === 0 ? Math.sin(popup.age / 40) * 0.4 : 0
        popup.view.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      }
    }
  }
}
