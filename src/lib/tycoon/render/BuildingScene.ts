import { Container, Graphics, Sprite, type Application } from 'pixi.js'
import { officeSpec, regionOf, staffOf } from '@/lib/tycoon/sim/offices'
import { overallProgress } from '@/lib/tycoon/sim/scoring'
import type { Employee, GameState, Office, Region, Role } from '@/lib/tycoon/sim/types'
import type { Atlas, FrameName } from './atlas'
import { CHAIR_TOP, DESK_WIDTH, FEET_ROW, freestandingDesk, placed } from './furniture'
import { momentAt } from '../render-support/activity'
import { chairX, seatX } from '../render-support/layout'
import { POSE_PAD } from '../render-support/poses'
import { routineAt, scrumBoardRects } from '../render-support/routines'
import { SeatMap } from '../render-support/seats'
import { WORKSTATIONS, workstationsFor } from '../render-support/workstations'
import {
  BOARD_X,
  BOARD_Y,
  BREAK_SPOTS,
  buildingLayout,
  floorHuddle,
  floorPartitionAt,
  FLOOR_H,
  FLOOR_W,
  LOBBY_H,
  MARGIN,
  ROOF_H,
  TWO_BUILDINGS_MIN_WIDTH,
  WALL,
  WALL_BAND,
  type Box,
  type BuildingBox,
  type BuildingLayout,
  type FloorBox,
} from '../render-support/building'

/** Floors meet a slab this thick. */
const SLAB = 4
/** On a coffee break the spots at the wall change hands this often, so everyone gets up at some point. */
const BREAK_TURN_MS = 6000
/** Someone at the coffee machine or the cooler has their cup up this long, then down for the rest. */
const SIP_UP_MS = 2200
const SIP_MS = 3400

// From the art pack's palette.
const DARK = 0x333c57
const INK = 0x14141f
const GLASS = 0x73eff7
const SLATE = 0x566c86
const STEEL = 0x94b0c2
const WHITE = 0xf4f4f4

/** Each region builds its own way: brick and a bright open-plan office in the US, pale stone, oak and plants in Europe. */
interface Style {
  facade: number
  facadeLine: number
  roof: number
  awning: readonly [number, number]
  wall: number
  wallLine: number
  floorA: number
  floorB: number
  chairs: readonly FrameName[]
}

const STYLES: Record<Region, Style> = {
  us: {
    facade: 0x8a4e3c,
    facadeLine: 0x6b3a2e,
    roof: 0x333c57,
    awning: [0xb13e53, WHITE],
    wall: 0xf4f4f4,
    wallLine: 0x94b0c2,
    floorA: 0x41a6f6,
    floorB: 0x3b5dc9,
    chairs: ['chairBlue', 'chairRed', 'chairOrange', 'chairGreen'],
  },
  eu: {
    facade: 0xd8d0bc,
    facadeLine: 0xb3a98f,
    roof: 0x4a5a4e,
    awning: [0x3b5dc9, 0xffcd75],
    wall: 0xf2ead8,
    wallLine: 0xc9b48a,
    floorA: 0xc98a52,
    floorB: 0xa86c3e,
    chairs: ['chairWhite', 'chairGray'],
  },
}

/** A tiny flag of Europe: twelve gold stars in a ring on blue. */
function euFlag(x: number, y: number): Graphics {
  const g = new Graphics().rect(0, 0, 12, 9).fill(0x003399)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.rect(Math.round(6 + Math.cos(a) * 3.2 - 0.5), Math.round(4.5 + Math.sin(a) * 3.2 - 0.5), 1, 1)
  }
  g.fill(0xffcc00)
  g.position.set(x, y)
  return g
}

/** One person drawn on a floor: their sprite, standing or posed, placed by the middle of their feet. */
class Person {
  readonly sprite = new Sprite()
  private key = ''

  constructor(
    private readonly atlas: Atlas,
    readonly id: number,
  ) {}

  /** Seated at a desk in `pose` (undefined: sitting still), or standing (`stand`, or a standing pose) with their feet at (x, y). */
  show(pose: Parameters<Atlas['character']>[1] | 'stand', x: number, feetY: number, flip = false): void {
    const key = `${pose}:${x}:${feetY}:${flip}`
    if (key === this.key) return
    this.key = key
    const base = this.atlas.character(this.id)
    const texture = pose === 'stand' ? base : this.atlas.character(this.id, pose ?? 'sit')
    const padded = texture.width !== base.width ? POSE_PAD.left : 0
    this.sprite.texture = texture
    this.sprite.scale.x = flip ? -1 : 1
    const left = Math.round(x - base.width / 2)
    this.sprite.x = flip ? left + base.width + padded : left - padded
    this.sprite.y = feetY - (base.height - 1)
  }
}

/** One floor of a building: its room drawn once, the Scrum board as far along as the work, and its people moved about every frame. */
class FloorView {
  readonly container = new Container()
  private readonly room = new Container()
  private readonly board = new Graphics()
  private readonly people = new Container()
  private readonly persons = new Map<number, Person>()
  private builtFor = ''
  private boardFor = -1

  constructor(
    private readonly atlas: Atlas,
    readonly officeId: number,
    private readonly seats: SeatMap,
  ) {
    this.board.position.set(BOARD_X, BOARD_Y)
    this.container.addChild(this.room, this.board, this.people)
  }

  update(state: GameState, office: Office, box: FloorBox, routineMs: number, timeMs: number): void {
    this.container.position.set(box.x, box.y)
    const staff = staffOf(state, office)
    const desks = officeSpec(office).desks
    this.seats.sync(
      staff.map((e) => e.id),
      desks,
    )
    // Whoever has worked at a desk decides what is on it, as up close.
    const roles = new Map<number, Role>()
    for (const e of staff) {
      const desk = this.seats.deskFor(e.id)
      if (desk !== undefined) roles.set(desk, e.role)
    }
    const key = `${regionOf(office)}|${desks}|${[...roles].sort(([a], [b]) => a - b).map(([d, r]) => `${d}${r[0]}`).join(',')}`
    if (key !== this.builtFor) {
      this.builtFor = key
      this.buildRoom(regionOf(office), desks, roles)
    }
    const notes = office.project ? Math.round(overallProgress(office.project) * 9) : 0
    if (notes !== this.boardFor) {
      this.boardFor = notes
      this.board.clear()
      for (const { x, y, w, h, color } of scrumBoardRects(notes / 9)) this.board.rect(x, y, w, h).fill(color)
    }
    this.placePeople(office, staff, routineMs, timeMs)
  }

  /** The back wall with its windows, coffee corner and plants, the floor, and the desks laid out as on the floor up close. */
  private buildRoom(region: Region, desks: number, roles: Map<number, Role>): void {
    const { atlas } = this
    const style = STYLES[region]
    for (const child of this.room.removeChildren()) child.destroy({ children: true })
    const room = this.room
    const inside = FLOOR_H - SLAB

    const g = new Graphics()
    // The back wall, a skirting along its foot, and in Europe an oak wainscot.
    g.rect(0, 0, FLOOR_W, WALL_BAND).fill(style.wall)
    if (region === 'eu') g.rect(0, WALL_BAND - 7, FLOOR_W, 5).fill(0xb98a5a).rect(0, WALL_BAND - 7, FLOOR_W, 1).fill(0x8a5a3c)
    g.rect(0, WALL_BAND - 2, FLOOR_W, 2).fill(style.wallLine)
    // The floor: big blue tiles in the US, oak planks in Europe.
    const tile = region === 'eu' ? 24 : 16
    for (let row = 0; WALL_BAND + row * 4 < inside; row++) {
      const y = WALL_BAND + row * 4
      // Planks are laid in a running bond, tiles in a chequer.
      const shift = region === 'eu' ? (row % 3) * 8 : (row % 2) * 8
      for (let col = -1; col * tile - shift < FLOOR_W; col++) {
        const x = col * tile + shift
        const shade = (col + row) % 2 === 0 ? style.floorA : style.floorB
        const left = Math.max(0, x)
        const right = Math.min(FLOOR_W, x + tile)
        if (right > left) g.rect(left, y, right - left, Math.min(4, inside - y)).fill(shade)
      }
    }
    g.rect(0, inside, FLOOR_W, SLAB).fill(INK)
    room.addChild(g)

    // Along the wall, standing on the floor line: windows, the coffee corner and the water, plants; Europe hangs its flag.
    const foot = WALL_BAND + 1
    const decor: [FrameName, number, number][] = [
      ['windowPlain', 4, 1],
      ['counter', 32, foot - 16],
      ['coffeeMachine', 41, foot - 25],
      ['mug', 51, foot - 20],
      ['waterCooler', 70, foot - 17],
      ['windowNote', 92, 1],
      ['plant', 120, foot - 19],
      ['windowPlain', 140, 1],
      ['plant', 196, foot - 19],
      ['plant', 256, foot - 19],
    ]
    for (const [name, x, y] of decor) room.addChild(placed(atlas.frame(name), x, y))
    room.addChild(region === 'eu' ? euFlag(172, 6) : placed(atlas.frame('flagUs'), 172, 6))

    // Twelve desks, two partitions to a row as on the floor up close, each with its chair and computer.
    const chairs = new Container()
    const tops = new Container()
    for (let p = 0; p < Math.ceil(desks / 2); p++) {
      const [px, py] = floorPartitionAt(p)
      room.addChild(placed(atlas.frame('partition'), px, py))
      if (desks > 2 * p + 1) room.addChild(placed(atlas.frame('deskPole'), px + 37, py + 3))
    }
    for (let i = 0; i < desks; i++) {
      const [px, py] = floorPartitionAt(i >> 1)
      const right = (i & 1) === 1
      const chair = atlas.frame(style.chairs[i % style.chairs.length]!)
      chairs.addChild(placed(chair, px + chairX(right, chair.width), py + CHAIR_TOP, right))
      const deskX = px + (right ? 40 : 19)
      tops.addChild(placed(atlas.frame(right ? 'deskRight' : 'deskLeft'), deskX, py + 11))
      // The last row has no partition in front to run up to.
      if (2 * ((i >> 1) + 2) >= desks) tops.addChild(freestandingDesk(right)).position.set(deskX, py + 11)
      for (const kind of workstationsFor(roles.get(i), i)) {
        const { gap, width, top } = WORKSTATIONS[kind]
        // Against the edge of the desk nearest the person, under their hands.
        tops.addChild(placed(atlas.workstation(kind), deskX + (right ? DESK_WIDTH - gap - width : gap), py + top, right))
      }
    }
    room.addChild(chairs, tops)
  }

  /**
   * Everyone at their desk, typing or not; at the stand-up round the Scrum board; on a coffee break a few at a time
   * at the coffee machine, the cooler and the windows, taking turns.
   */
  private placePeople(office: Office, staff: Employee[], routineMs: number, timeMs: number): void {
    const working = office.project !== null
    const routine = routineAt(routineMs, office.id)
    const seated = staff.filter((e) => this.seats.deskFor(e.id) !== undefined).sort((a, b) => this.seats.deskFor(a.id)! - this.seats.deskFor(b.id)!)
    const huddle = routine?.routine === 'standup' ? floorHuddle(seated.length) : []
    const away = new Map<number, (typeof BREAK_SPOTS)[number]>()
    if (routine?.routine === 'break' && seated.length > 0) {
      const turn = Math.floor(routine.elapsed / BREAK_TURN_MS)
      for (let j = 0; j < Math.min(BREAK_SPOTS.length, seated.length); j++) away.set(seated[(turn * BREAK_SPOTS.length + j) % seated.length]!.id, BREAK_SPOTS[j]!)
    }
    const seen = new Set<number>()
    seated.forEach((employee, i) => {
      seen.add(employee.id)
      let person = this.persons.get(employee.id)
      if (!person) {
        person = new Person(this.atlas, employee.id)
        this.persons.set(employee.id, person)
        this.people.addChild(person.sprite)
      }
      const spot = huddle[i] ?? away.get(employee.id)
      if (spot) {
        // The two at the coffee machine and the cooler have a drink; the rest stand and talk.
        const sipping = BREAK_SPOTS.indexOf(spot) >= 0 && BREAK_SPOTS.indexOf(spot) < 2 && (timeMs + employee.id * 700) % SIP_MS < SIP_UP_MS
        person.show(sipping ? 'drink' : 'stand', spot.x, spot.feet, !spot.rightwards)
        return
      }
      const desk = this.seats.deskFor(employee.id)!
      const [px, py] = floorPartitionAt(desk >> 1)
      const right = (desk & 1) === 1
      person.show(momentAt(employee.id, timeMs, working).pose, px + seatX(right), py + 5 + FEET_ROW, right)
    })
    for (const [id, person] of this.persons) {
      if (seen.has(id)) continue
      person.sprite.destroy()
      this.persons.delete(id)
    }
    // Front rows over back rows.
    this.people.children.sort((a, b) => a.y + a.height - (b.y + b.height))
  }
}

/** A floor nobody rents yet: bare walls and floor with the lights off. */
function drawVacant(g: Graphics, box: Box): void {
  const inside = box.h - SLAB
  g.rect(box.x, box.y, box.w, WALL_BAND).fill(0x5a6988)
  g.rect(box.x, box.y + WALL_BAND - 2, box.w, 2).fill(SLATE)
  g.rect(box.x, box.y + WALL_BAND, box.w, inside - WALL_BAND).fill(0x41485e)
  for (let y = box.y + WALL_BAND + 20; y < box.y + inside; y += 20) g.rect(box.x, y, box.w, 1).fill(0x39405a)
  // Dark windows on the back wall, and a couple of boxes left by the last tenant.
  for (const wx of [8, 70, 140, 210]) g.rect(box.x + wx, box.y + 3, 26, 16).fill(0x2a3048).rect(box.x + wx + 12, box.y + 3, 2, 16).fill(0x5a6988)
  g.rect(box.x + 30, box.y + inside - 14, 14, 10).fill(0x8a6a4a).rect(box.x + 36, box.y + inside - 20, 10, 6).fill(0x9a7a5a)
  g.rect(box.x, box.y + inside, box.w, SLAB).fill(INK)
}

/** A building: facade, roof and lobby around its floors, the floors above them dark; an empty lot waiting for an office. */
function drawShell(g: Graphics, building: BuildingBox, style: Style): void {
  const { x, y, w, h, roof, lobby } = building
  if (!building.open) {
    // An empty lot with a fence and a sign post.
    g.rect(x, lobby.y + lobby.h - 10, w, 10).fill(0x5a6988)
    for (let fx = x + 4; fx < x + w; fx += 10) g.rect(fx, lobby.y - 2, 2, lobby.h - 8).fill(STEEL)
    g.rect(x, lobby.y + 2, w, 2).fill(STEEL)
    return
  }
  // Up on the roof: an air-conditioning unit and an aerial.
  g.rect(x + 14, y - 5, 16, 5).fill(SLATE).rect(x + 16, y - 4, 5, 3).fill(DARK).rect(x + 23, y - 4, 5, 3).fill(DARK)
  g.rect(x + w - 24, y - 6, 1, 6).rect(x + w - 27, y - 5, 7, 1).fill(DARK)
  // The facade, with brick (or stone) courses down both sides and a ledge at every floor.
  g.rect(x, y, w, h).fill(style.facade)
  for (let cy = roof.y + roof.h; cy < lobby.y; cy += 5) g.rect(x, cy, WALL, 1).rect(x + w - WALL, cy, WALL, 1)
  g.fill(style.facadeLine)
  for (let level = 0; level <= building.floors.length + building.vacant.length; level++) {
    g.rect(x - 2, lobby.y - level * FLOOR_H - 2, WALL + 2, 2).rect(x + w - WALL, lobby.y - level * FLOOR_H - 2, WALL + 2, 2)
  }
  g.fill(style.facadeLine)
  // The roof: a parapet with its cap, and the dark band the sign is lit on.
  g.rect(roof.x - 3, roof.y, roof.w + 6, 3).fill(style.roof)
  g.rect(roof.x + 30, roof.y + 4, roof.w - 60, roof.h - 5).fill(INK)
  for (const box of building.vacant) drawVacant(g, box)
  // The lobby: glass doors under an awning in the middle, windows either side, planters, and the pavement.
  g.rect(lobby.x + WALL, lobby.y, lobby.w - 2 * WALL, lobby.h - 2).fill(DARK)
  const mid = lobby.x + lobby.w / 2
  g.rect(mid - 14, lobby.y + 6, 28, lobby.h - 8).fill({ color: GLASS, alpha: 0.6 })
  g.rect(mid - 1, lobby.y + 6, 2, lobby.h - 8).fill(INK)
  for (let i = 0; i < 10; i++) g.rect(mid - 20 + i * 4, lobby.y + 1, 4, 3).fill(style.awning[i % 2]!)
  for (const wx of [lobby.x + 20, lobby.x + lobby.w - 70]) {
    g.rect(wx, lobby.y + 5, 50, 10).fill({ color: GLASS, alpha: 0.35 })
    g.rect(wx + 4, lobby.y + 15, 42, 3).fill(0x38b764)
  }
  g.rect(x - 4, lobby.y + lobby.h - 2, w + 8, 2).fill(STEEL)
}

/** A street tree: a trunk and a round crown, its foot at (x, foot). */
function drawTree(g: Graphics, x: number, foot: number): void {
  g.rect(x - 1, foot - 12, 3, 12).fill(0x7a4a2a)
  g.rect(x - 7, foot - 26, 15, 12).rect(x - 5, foot - 29, 11, 18).fill(0x38b764)
  g.rect(x - 4, foot - 26, 4, 3).fill(0xa7f070)
}

/**
 * The studio from the street once it has left the garage: its buildings, each floor open to view with its team
 * at work, the floors not rented yet dark. The game's own React layer puts the labels and buttons over it (see `buildingLayout`).
 */
export class BuildingScene {
  readonly view = new Container()
  private readonly sky = new Graphics()
  private readonly shells = new Graphics()
  private readonly floorsLayer = new Container()
  private readonly floors = new Map<number, FloorView>()
  private layoutNow: BuildingLayout | null = null
  private areaW = 0
  private areaH = 0
  private time = 0
  private shellKey = ''

  constructor(
    _app: Application,
    private readonly atlas: Atlas,
    private readonly getState: () => GameState,
    /** On a narrow screen only one building is shown: this one. */
    private readonly getRegion: () => Region,
    /** How long the game has been running, which sets when each floor has its stand-up and its coffee break. */
    private readonly getRoutineTime: () => number,
    /** Who sits where, shared with the floor up close so that everyone has the same desk in both. */
    private readonly seatMaps: Map<number, SeatMap>,
  ) {
    this.view.addChild(this.sky, this.shells, this.floorsLayer)
  }

  layout(width: number, height: number): void {
    this.areaW = width
    this.areaH = height
    this.shellKey = ''
  }

  update(dtMs: number, speed = 1): void {
    if (speed > 0) this.time += dtMs
    const state = this.getState()
    const only = this.areaW < TWO_BUILDINGS_MIN_WIDTH ? this.getRegion() : undefined
    const layout = buildingLayout(state, this.areaW, this.areaH, only)
    this.layoutNow = layout

    const key = `${this.areaW}x${this.areaH}|${only ?? ''}|${layout.buildings.map((b) => `${b.region}${b.floors.length}`).join(',')}`
    if (key !== this.shellKey) {
      this.shellKey = key
      this.drawSky()
      this.shells.clear()
      for (const building of layout.buildings) drawShell(this.shells, building, STYLES[building.region])
      this.view.scale.set(layout.scale)
      this.view.position.set(layout.offsetX, layout.offsetY)
    }

    const shown = new Set<number>()
    const routineMs = this.getRoutineTime()
    for (const building of layout.buildings) {
      for (const box of building.floors) {
        const office = state.offices.find((o) => o.id === box.officeId)
        if (!office) continue
        shown.add(office.id)
        let floor = this.floors.get(office.id)
        if (!floor) {
          let seats = this.seatMaps.get(office.id)
          if (!seats) {
            seats = new SeatMap()
            this.seatMaps.set(office.id, seats)
          }
          floor = new FloorView(this.atlas, office.id, seats)
          this.floors.set(office.id, floor)
          this.floorsLayer.addChild(floor.container)
        }
        floor.update(state, office, box, routineMs, this.time)
      }
    }
    for (const [id, floor] of this.floors) {
      if (shown.has(id)) continue
      floor.container.destroy({ children: true })
      this.floors.delete(id)
    }
  }

  /** The sky behind the buildings with a few clouds, and the street in front with its trees, across the whole area. */
  private drawSky(): void {
    const layout = this.layoutNow
    const scale = layout?.scale ?? 1
    const ox = layout?.offsetX ?? 0
    const oy = layout?.offsetY ?? 0
    // In scene pixels, reaching every edge of the area.
    const left = -ox / scale
    const top = -oy / scale
    const width = this.areaW / scale
    const height = this.areaH / scale
    const street = (layout?.height ?? 0) - MARGIN
    const g = this.sky.clear()
    const bands = [0x9fd3f2, 0xb4ddf5, 0xc9e7f8]
    bands.forEach((color, i) => g.rect(left, top + (i * (street - top)) / bands.length, width, (street - top) / bands.length + 1).fill(color))
    // Clouds, spread over the sky whatever its width.
    for (let i = 0; i < 6; i++) {
      const cx = left + ((i * 0.37 + 0.11) % 1) * width
      const cy = top + 20 + ((i * 0.53) % 1) * Math.max(40, street - top - ROOF_H - LOBBY_H - 2 * FLOOR_H)
      g.rect(cx, cy, 34, 6).rect(cx + 6, cy - 4, 18, 4).rect(cx + 20, cy - 2, 10, 2).fill({ color: WHITE, alpha: 0.85 })
    }
    g.rect(left, street, width, height).fill(SLATE)
    g.rect(left, street, width, 3).fill(STEEL)
    // Trees on the pavement: beside each building, and between the two when both stand.
    const buildings = layout?.buildings ?? []
    const spots = new Set<number>()
    for (const b of buildings) spots.add(b.x - 12).add(b.x + b.w + 12)
    for (const x of spots) drawTree(g, x, street)
  }

  /** Where everything is on screen, for the labels and buttons laid over the canvas. */
  get currentLayout(): BuildingLayout | null {
    return this.layoutNow
  }
}
