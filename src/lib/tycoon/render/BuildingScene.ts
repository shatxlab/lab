import { Container, Graphics, Sprite, type Application, type Texture } from 'pixi.js'
import { officeSpec, regionOf, staffOf } from '@/lib/tycoon/sim/offices'
import type { Employee, GameState, Office, Region } from '@/lib/tycoon/sim/types'
import type { Atlas, FrameName } from './atlas'
import { momentAt } from '../render-support/activity'
import { chairX, LEFT_SEAT_X } from '../render-support/layout'
import { POSE_PAD } from '../render-support/poses'
import { WORKSTATIONS, workstationsFor } from '../render-support/workstations'
import { bookshelfRects, BOOKSHELF_HEIGHT } from '../render-support/bookshelf'
import {
  buildingLayout,
  deskAt,
  FLOOR_H,
  FLOOR_W,
  MEETING_X,
  TWO_BUILDINGS_MIN_WIDTH,
  WALL,
  WALL_BAND,
  type BuildingBox,
  type BuildingLayout,
  type FloorBox,
} from '../render-support/building'

/** From the top of a desk unit to its chair, as in the office (`CHAIR_TOP`), and a seated person's feet (`FEET_ROW`). */
const CHAIR_TOP = 9
const FEET_ROW = 22
/** The desk top: where it starts in its unit, how wide and how deep it is. */
const DESK_X = 19
const DESK_WIDTH = 17
const DESK_DEPTH = 19
/** Floors meet a slab this thick. */
const SLAB = 4
/** A stand-up is drawn on one day in this many, for the whole day: often enough to see, rarely enough not to fidget. */
const STANDUP_EVERY_DAYS = 7

// From the art pack's palette.
const DARK = 0x333c57
const WOOD = 0xef7d57
const INK = 0x14141f
const GLASS = 0x73eff7

/** Each region builds its own way: brick and a bright open-plan office in the US, pale stone, oak and plants in Europe. */
interface Style {
  facade: number
  facadeLine: number
  roof: number
  wall: number
  wallLine: number
  floorA: number
  floorB: number
  chairs: readonly FrameName[]
}

const STYLES: Record<Region, Style> = {
  us: { facade: 0x8a4e3c, facadeLine: 0x6b3a2e, roof: 0x333c57, wall: 0xf4f4f4, wallLine: 0x94b0c2, floorA: 0x41a6f6, floorB: 0x3b5dc9, chairs: ['chairBlue', 'chairRed', 'chairOrange', 'chairGreen'] },
  eu: { facade: 0xd8d0bc, facadeLine: 0xb3a98f, roof: 0x4a5a4e, wall: 0xf2ead8, wallLine: 0xc9b48a, floorA: 0xc98a52, floorB: 0xa86c3e, chairs: ['chairWhite', 'chairGray'] },
}

function placed(texture: Texture, x: number, y: number, flip = false): Sprite {
  const sprite = new Sprite(texture)
  sprite.scale.x = flip ? -1 : 1
  sprite.x = flip ? x + texture.width : x
  sprite.y = y
  return sprite
}

/** The front edge and legs of a desk standing on its own (no partition in front), as the garage's desks are drawn. */
function deskFront(x: number, y: number): Graphics {
  const g = new Graphics()
  const front = DESK_DEPTH
  g.rect(DESK_WIDTH - 1, 1, 1, front - 1)
  g.rect(0, front, DESK_WIDTH, 1).rect(0, front + 1, 1, 1).rect(DESK_WIDTH - 1, front + 1, 1, 1).rect(0, front + 2, DESK_WIDTH, 1)
  g.rect(0, front + 3, 2, 2).rect(DESK_WIDTH - 2, front + 3, 2, 2)
  g.fill(DARK)
  g.rect(1, front + 1, DESK_WIDTH - 2, 1).fill(WOOD)
  g.position.set(x, y)
  return g
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

  /** Seated at desk `index` (pose may be undefined: sitting still), or standing with their feet at (x, y). */
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

/** One floor of a building: its room drawn once, and its people moved about every frame. */
class FloorView {
  readonly container = new Container()
  private readonly room = new Container()
  private readonly people = new Container()
  private readonly persons = new Map<number, Person>()
  private builtFor = ''

  constructor(
    private readonly atlas: Atlas,
    readonly officeId: number,
  ) {
    this.container.addChild(this.room, this.people)
  }

  update(state: GameState, office: Office, box: FloorBox, timeMs: number): void {
    this.container.position.set(box.x, box.y)
    const staff = staffOf(state, office).sort((a, b) => a.id - b.id)
    const key = `${regionOf(office)}|${officeSpec(office).desks}|${staff.map((e) => `${e.id}${e.role[0]}`).join(',')}`
    if (key !== this.builtFor) {
      this.builtFor = key
      this.buildRoom(regionOf(office), staff)
    }
    this.placePeople(state, office, staff, timeMs)
  }

  /** The back wall with its windows and machines, the floor, the desks with their chairs and computers, and the meeting room. */
  private buildRoom(region: Region, staff: Employee[]): void {
    const { atlas } = this
    const style = STYLES[region]
    for (const child of this.room.removeChildren()) child.destroy({ children: true })
    const room = this.room
    const inside = FLOOR_H - SLAB

    const g = new Graphics()
    // The back wall, a line along its foot, and in Europe an oak wainscot.
    g.rect(0, 0, FLOOR_W, WALL_BAND).fill(style.wall)
    g.rect(0, WALL_BAND - 2, FLOOR_W, 2).fill(style.wallLine)
    if (region === 'eu') g.rect(0, WALL_BAND - 8, FLOOR_W, 6).fill(0xb98a5a).rect(0, WALL_BAND - 8, FLOOR_W, 1).fill(0x8a5a3c)
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

    // Along the wall: windows, the coffee corner, water and snacks; Europe has books and plants where the US has a snack cabinet.
    const decor: [FrameName, number, number][] = [
      ['windowPlain', 6, 4],
      ['counter', 40, 15],
      ['coffeeMachine', 49, 5],
      ['mug', 59, 11],
      ['waterCooler', 72, 14],
      ['windowNote', 120, 4],
      ['plant', 172, 12],
    ]
    if (region === 'us') decor.push(['snackCabinet', 88, 0], ['flagUs', 154, 8])
    else decor.push(['plant', 98, 12], ['plant', 152, 12])
    for (const [name, x, y] of decor) room.addChild(placed(atlas.frame(name), x, y))
    if (region === 'eu') {
      const shelf = new Graphics()
      for (const { x, y, w, h, color } of bookshelfRects()) shelf.rect(x, y, w, h).fill(color)
      shelf.position.set(90, WALL_BAND + 4 - BOOKSHELF_HEIGHT)
      room.addChild(shelf, euFlag(154, 8))
    }

    // The meeting room behind glass at the right end, with its table and whiteboard.
    const glass = new Graphics()
      .rect(MEETING_X, 0, FLOOR_W - MEETING_X, inside)
      .fill({ color: GLASS, alpha: 0.08 })
      .rect(MEETING_X, 0, 2, inside)
      .fill({ color: GLASS, alpha: 0.55 })
      .rect(MEETING_X, 0, 2, 2)
      .fill(DARK)
    room.addChild(glass, placed(atlas.frame('whiteboard'), MEETING_X + 22, 4), placed(atlas.frame('tableLong'), MEETING_X + 16, 46))
    room.addChild(placed(atlas.frame('chairGray'), MEETING_X + 8, 40), placed(atlas.frame('chairGray'), MEETING_X + 58, 40, true))

    // Twelve desks in two rows of six, each with its chair and the computer that suits whoever sits there.
    for (let i = 0; i < 12; i++) {
      const [px, py] = deskAt(i)
      const chair = atlas.frame(style.chairs[i % style.chairs.length])
      room.addChild(placed(chair, px + chairX(false, chair.width), py + CHAIR_TOP))
      room.addChild(placed(atlas.frame('deskLeft'), px + DESK_X, py + 11), deskFront(px + DESK_X, py + 11))
      const person = staff[i]
      if (!person) continue
      for (const kind of workstationsFor(person.role, i)) {
        const { gap, width, top } = WORKSTATIONS[kind]
        room.addChild(placed(atlas.workstation(kind), px + DESK_X + DESK_WIDTH - gap - width, py + top))
      }
    }
  }

  /** Everyone at their desk, typing or not; on a stand-up day around the meeting table; on a break at the coffee corner. */
  private placePeople(state: GameState, office: Office, staff: Employee[], timeMs: number): void {
    const working = office.project !== null
    const standup = office.standup === true && state.day % STANDUP_EVERY_DAYS === 0 && working
    const seen = new Set<number>()
    // The spots along the wall where someone on a coffee break stands: the coffee machine, the water, the snacks.
    const breakSpots = office.breaks ? [52, 77, 100] : []
    staff.slice(0, 12).forEach((employee, i) => {
      seen.add(employee.id)
      let person = this.persons.get(employee.id)
      if (!person) {
        person = new Person(this.atlas, employee.id)
        this.persons.set(employee.id, person)
        this.people.addChild(person.sprite)
      }
      if (standup) {
        // Two rows around the table, the back row behind it.
        const slot = i % 12
        const back = slot % 2 === 0
        person.show('stand', MEETING_X + 12 + Math.floor(slot / 2) * 10, back ? 47 : 66, slot % 4 >= 2)
        return
      }
      const moment = momentAt(employee.id, timeMs, working)
      if (moment.pose === 'sip' && breakSpots.length > 0) {
        person.show('stand', breakSpots.shift()!, WALL_BAND + 4, true)
        return
      }
      const [px, py] = deskAt(i)
      person.show(moment.pose, px + LEFT_SEAT_X, py + 5 + FEET_ROW)
    })
    for (const [id, person] of this.persons) {
      if (seen.has(id)) continue
      person.sprite.destroy()
      this.persons.delete(id)
    }
    // Front rows over back rows, and the meeting room in step.
    this.people.children.sort((a, b) => a.y + a.height - (b.y + b.height))
  }
}

/** A building: facade, roof and lobby around its floors; an empty lot waiting for an office. */
function drawShell(g: Graphics, building: BuildingBox, style: Style): void {
  const { x, y, w, h, roof, lobby } = building
  if (!building.open) {
    // An empty lot with a fence and a sign post.
    g.rect(x, lobby.y + lobby.h - 10, w, 10).fill(0x5a6988)
    for (let fx = x + 4; fx < x + w; fx += 10) g.rect(fx, lobby.y + 2, 2, lobby.h - 12).fill(0x94b0c2)
    g.rect(x, lobby.y + 6, w, 2).fill(0x94b0c2)
    return
  }
  // The facade, with brick (or stone) courses.
  g.rect(x, y, w, h).fill(style.facade)
  for (let cy = roof.y + roof.h; cy < lobby.y; cy += 5) g.rect(x, cy, WALL, 1).rect(x + w - WALL, cy, WALL, 1)
  g.fill(style.facadeLine)
  // The roof and its parapet.
  g.rect(roof.x - 3, roof.y, roof.w + 6, 4).fill(style.roof)
  g.rect(roof.x + 30, roof.y + 5, roof.w - 60, roof.h - 6).fill(INK)
  // The lobby: glass doors in the middle, windows either side, and the pavement.
  g.rect(lobby.x + WALL, lobby.y, lobby.w - 2 * WALL, lobby.h - 4).fill(DARK)
  const mid = lobby.x + lobby.w / 2
  g.rect(mid - 14, lobby.y + 4, 28, lobby.h - 8).fill({ color: GLASS, alpha: 0.6 })
  g.rect(mid - 1, lobby.y + 4, 2, lobby.h - 8).fill(INK)
  for (const wx of [lobby.x + 20, lobby.x + lobby.w - 70]) g.rect(wx, lobby.y + 5, 50, 10).fill({ color: GLASS, alpha: 0.35 })
  g.rect(x - 4, lobby.y + lobby.h - 4, w + 8, 4).fill(0x94b0c2)
}

/**
 * The studio from the street once it has left the garage: its buildings, each floor open to view with its team
 * at work. The game's own React layer puts the labels and buttons over it (see `buildingLayout`).
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
    for (const building of layout.buildings) {
      for (const box of building.floors) {
        const office = state.offices.find((o) => o.id === box.officeId)
        if (!office) continue
        shown.add(office.id)
        let floor = this.floors.get(office.id)
        if (!floor) {
          floor = new FloorView(this.atlas, office.id)
          this.floors.set(office.id, floor)
          this.floorsLayer.addChild(floor.container)
        }
        floor.update(state, office, box, this.time)
      }
    }
    for (const [id, floor] of this.floors) {
      if (shown.has(id)) continue
      floor.container.destroy({ children: true })
      this.floors.delete(id)
    }
  }

  /** The sky behind the buildings and the street in front, across the whole area. */
  private drawSky(): void {
    const scale = this.layoutNow?.scale ?? 1
    const ox = this.layoutNow?.offsetX ?? 0
    const oy = this.layoutNow?.offsetY ?? 0
    // In scene pixels, reaching every edge of the area.
    const left = -ox / scale
    const top = -oy / scale
    const width = this.areaW / scale
    const height = this.areaH / scale
    const street = (this.layoutNow?.height ?? 0) - 8
    this.sky.clear()
    const bands = [0x9fd3f2, 0xb4ddf5, 0xc9e7f8]
    bands.forEach((color, i) => this.sky.rect(left, top + (i * (street - top)) / bands.length, width, (street - top) / bands.length + 1).fill(color))
    this.sky.rect(left, street, width, height).fill(0x566c86)
    this.sky.rect(left, street, width, 2).fill(0x94b0c2)
  }

  /** Where everything is on screen, for the labels and buttons laid over the canvas. */
  get currentLayout(): BuildingLayout | null {
    return this.layoutNow
  }
}

