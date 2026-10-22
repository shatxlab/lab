import { REGION_OFFICE_LIMIT } from '@/lib/tycoon/sim/balance'
import { officesIn } from '@/lib/tycoon/sim/offices'
import { REGIONS, type GameState, type Region } from '@/lib/tycoon/sim/types'

/**
 * The building view: headquarters and the European office seen from the street, each floor cut open like a doll's
 * house. Everything here is in sprite pixels and pure, so the canvas that draws the buildings and the buttons laid
 * over them agree on where every floor is.
 */

/** Inside a floor: its width, and its height with the slab under it. */
export const FLOOR_W = 272
export const FLOOR_H = 78
/** The outer wall around the floors, the roof with its sign, and the lobby at street level. */
export const WALL = 6
export const ROOF_H = 16
export const LOBBY_H = 26
/** Between two buildings, and around the pair. */
export const GAP = 28
export const MARGIN = 8

export const BUILDING_W = FLOOR_W + 2 * WALL
/** A building is laid out for all its floors from the start, so it grows upward as floors are added and never jumps. */
export const BUILDING_H = ROOF_H + REGION_OFFICE_LIMIT * FLOOR_H + LOBBY_H

/** Inside a floor: the back wall above the floor line, and the meeting room at the right end. */
export const WALL_BAND = 30
export const MEETING_X = 196

/** Desks in two rows of six; a desk "unit" (chair, person and desk) is this wide, its rows this far apart. */
export const DESKS_PER_ROW = 6
export const DESK_STRIDE = 28
export const DESK_ROWS = [26, 44] as const
export const DESK_LEFT = 4

/** Where desk `index` of a floor stands: the top-left of its unit, as a partition would be in the office (`partitionAt`). */
export function deskAt(index: number): [x: number, y: number] {
  const row = Math.floor(index / DESKS_PER_ROW) % DESK_ROWS.length
  // The back row is staggered half a desk, so the people in front do not hide the ones behind.
  return [DESK_LEFT + (index % DESKS_PER_ROW) * DESK_STRIDE + (row === 0 ? DESK_STRIDE / 2 : 0), DESK_ROWS[row]]
}

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
 * `only` set, just that region's (on a phone there is no room for two). Floors stack from the lobby up; a region
 * with no office is an empty lot. The scale is the largest that fits, in quarter steps so pixels stay even.
 */
export function buildingLayout(state: GameState, areaW: number, areaH: number, only?: Region): BuildingLayout {
  const regions = only ? [only] : REGIONS
  const width = regions.length * BUILDING_W + (regions.length - 1) * GAP + 2 * MARGIN
  const height = BUILDING_H + 2 * MARGIN
  const fit = Math.min(areaW / width, areaH / height)
  const scale = Math.max(0.25, Math.floor(fit * 4) / 4)
  const buildings = regions.map((region, i): BuildingBox => {
    const x = MARGIN + i * (BUILDING_W + GAP)
    const offices = officesIn(state, region).filter((o) => o.kind === 'office')
    const lobbyY = MARGIN + BUILDING_H - LOBBY_H
    const floors = offices.map((office, floor): FloorBox => ({
      officeId: office.id,
      region,
      floor: floor + 1,
      x: x + WALL,
      y: lobbyY - (floor + 1) * FLOOR_H,
      w: FLOOR_W,
      h: FLOOR_H,
    }))
    const top = lobbyY - Math.max(floors.length, 0) * FLOOR_H - ROOF_H
    return {
      region,
      open: floors.length > 0,
      floors,
      x,
      y: top,
      w: BUILDING_W,
      h: lobbyY + LOBBY_H - top,
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
