import { REGION_OFFICE_LIMIT } from '@/lib/tycoon/sim/balance'
import { officesIn } from '@/lib/tycoon/sim/offices'
import { REGIONS, type GameState, type Region } from '@/lib/tycoon/sim/types'
import { huddleSpots, type HuddleSpot } from './routines'

/**
 * The building view: headquarters and the European office seen from the street, each floor cut open like a doll's
 * house. Everything here is in sprite pixels and pure, so the canvas that draws the buildings and the buttons laid
 * over them agree on where every floor is.
 */

/** Inside a floor: its width, and its height with the slab under it. */
export const FLOOR_W = 272
export const FLOOR_H = 128
/** The outer wall around the floors, the roof with its sign, and the lobby at street level. */
export const WALL = 6
export const ROOF_H = 14
export const LOBBY_H = 22
/** Between two buildings, and around the pair. */
export const GAP = 28
export const MARGIN = 6

export const BUILDING_W = FLOOR_W + 2 * WALL
/** A building is always drawn with all its floors, the ones not rented yet dark, so it stands complete from the start. */
export const BUILDING_H = ROOF_H + REGION_OFFICE_LIMIT * FLOOR_H + LOBBY_H

/** Inside a floor: the back wall above the floor line. */
export const WALL_BAND = 24

/**
 * The desks are laid out as on the floor up close: partitions of two desks, two side by side with an aisle between
 * them, in rows; the first row starts just below where people stand at the wall. The right end is open floor, with the
 * Scrum board on its wall.
 */
export const DESK_LEFT = 4
export const DESK_TOP = 29
export const PARTITION_STEP = 112
export const DESK_ROW = 30

/** Top-left of desk partition `p` (each holds two desks), as `partitionAt` is in the office up close. */
export function floorPartitionAt(p: number): [x: number, y: number] {
  return [DESK_LEFT + (p % 2) * PARTITION_STEP, DESK_TOP + DESK_ROW * Math.floor(p / 2)]
}

/** The Scrum board on the right end's wall (its top-left corner), and the rows the team stands in round it. */
export const BOARD_X = 220
export const BOARD_Y = 3
const HUDDLE_CENTER = 235
const HUDDLE_ROWS = [44, 60, 76, 92] as const

/** Where everyone stands at the stand-up, by desk order: rows of four in front of the board. */
export function floorHuddle(count: number): HuddleSpot[] {
  return huddleSpots(count, HUDDLE_CENTER, HUDDLE_ROWS, 4, 15, -7)
}

/** Where people stand on a coffee break, at the wall: the coffee machine, the water cooler, and by the windows. */
export const BREAK_SPOTS: readonly HuddleSpot[] = [
  { x: 54, feet: WALL_BAND + 3, rightwards: false },
  { x: 85, feet: WALL_BAND + 3, rightwards: false },
  { x: 111, feet: WALL_BAND + 3, rightwards: true },
  { x: 125, feet: WALL_BAND + 3, rightwards: false },
  { x: 184, feet: WALL_BAND + 3, rightwards: true },
]

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface FloorBox extends Box {
  officeId: number
  region: Region
  /** 1 at the bottom. */
  floor: number
}

export interface BuildingBox extends Box {
  region: Region
  /** False for a region with no office yet: an empty lot, waiting. */
  open: boolean
  floors: FloorBox[]
  /** The floors above them not rented yet, lowest first. */
  vacant: Box[]
  /** The sign on the roof, and the lobby, in scene pixels. */
  roof: Box
  lobby: Box
}

export interface BuildingLayout {
  /** Screen pixels per sprite pixel. */
  scale: number
  /** Where the scene's origin lands on screen, in screen pixels. */
  offsetX: number
  offsetY: number
  /** The whole scene, in sprite pixels. */
  width: number
  height: number
  buildings: BuildingBox[]
}

/**
 * Lays out the buildings to show in an area of `areaW` x `areaH` screen pixels: both side by side, or with
 * `only` set, just that region's (on a phone there is no room for two). Floors stack from the lobby up to the
 * roof, the ones not rented yet empty; a region with no office is an empty lot. The scale is the largest that fits,
 * in eighth steps.
 */
export function buildingLayout(state: GameState, areaW: number, areaH: number, only?: Region): BuildingLayout {
  const regions = only ? [only] : REGIONS
  const width = regions.length * BUILDING_W + (regions.length - 1) * GAP + 2 * MARGIN
  const height = BUILDING_H + 2 * MARGIN
  const fit = Math.min(areaW / width, areaH / height)
  const scale = Math.max(0.25, Math.floor(fit * 8) / 8)
  const buildings = regions.map((region, i): BuildingBox => {
    const x = MARGIN + i * (BUILDING_W + GAP)
    const offices = officesIn(state, region).filter((o) => o.kind === 'office')
    const lobbyY = MARGIN + BUILDING_H - LOBBY_H
    const level = (floor: number): Box => ({ x: x + WALL, y: lobbyY - (floor + 1) * FLOOR_H, w: FLOOR_W, h: FLOOR_H })
    const floors = offices.slice(0, REGION_OFFICE_LIMIT).map((office, floor): FloorBox => ({ officeId: office.id, region, floor: floor + 1, ...level(floor) }))
    const open = floors.length > 0
    const vacant = open ? Array.from({ length: REGION_OFFICE_LIMIT - floors.length }, (_, k) => level(floors.length + k)) : []
    const top = MARGIN
    return {
      region,
      open,
      floors,
      vacant,
      x,
      y: top,
      w: BUILDING_W,
      h: BUILDING_H,
      roof: { x, y: top, w: BUILDING_W, h: ROOF_H },
      lobby: { x, y: lobbyY, w: BUILDING_W, h: LOBBY_H },
    }
  })
  return {
    scale,
    offsetX: Math.round((areaW - width * scale) / 2),
    offsetY: Math.round(areaH - height * scale),
    width,
    height,
    buildings,
  }
}

/** A box in sprite pixels, on screen. */
export function toScreen(layout: BuildingLayout, box: Box): Box {
  return { x: layout.offsetX + box.x * layout.scale, y: layout.offsetY + box.y * layout.scale, w: box.w * layout.scale, h: box.h * layout.scale }
}

/** Below this width the area shows one building at a time. */
export const TWO_BUILDINGS_MIN_WIDTH = 560
