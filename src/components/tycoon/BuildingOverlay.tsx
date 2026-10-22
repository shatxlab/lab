import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { buildingLayout, FLOOR_H, toScreen, TWO_BUILDINGS_MIN_WIDTH, WALL_BAND, type Box } from '@/lib/tycoon/render-support/building'
import { REGION_OFFICE_LIMIT } from '@/lib/tycoon/sim/balance'
import { buildingName, getOffice, inGarage, officeName, officesIn, openOfficeBlocker, regionOf, teamOf } from '@/lib/tycoon/sim/offices'
import { overallProgress } from '@/lib/tycoon/sim/scoring'
import { DEFAULT_DIRECTION, DIRECTION_INFO, ownedProduct } from '@/lib/tycoon/sim/teams'
import { REGIONS, type GameState, type Office, type Region } from '@/lib/tycoon/sim/types'
import { useGame, useSignal, useStore } from './context'

/** The element's size in CSS pixels, kept up to date. */
function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current?.parentElement
    if (!element) return
    const read = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

const at = (box: Box) => ({ left: box.x, top: box.y, width: box.w, height: box.h })

/** What a floor is doing, in a few words: its project and how far along, or the product it looks after. */
function floorStatus(state: GameState, office: Office): string {
  if (teamOf(state, office).length === 0) return 'empty: hire into it'
  const project = office.project
  if (project) {
    const done = `${Math.round(overallProgress(project) * 100)}%`
    if (project.kind === 'contract') return `client work · ${done}`
    return `${project.name}${project.kind === 'update' ? ' release' : ''} · ${done}`
  }
  const product = ownedProduct(state, office)
  return product ? `${product.name} · ${DIRECTION_INFO[office.direction ?? DEFAULT_DIRECTION].name}` : 'idle'
}

/**
 * Over the buildings: a button on every floor (its name and what it is doing; tap to go in), a place to add the
 * next floor, the European lot, and on a narrow screen a switch between the two buildings.
 */
export function BuildingOverlay() {
  const store = useStore()
  const state = useGame()
  const view = useSignal(store.view)
  const selected = useSignal(store.selectedOffice)
  const ref = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(ref)
  const garage = inGarage(state)

  if (garage) return <div ref={ref} hidden />
  if (view === 'floor') {
    return (
      <div ref={ref} className="floor-back">
        <button onClick={() => store.setView('building')}>← Buildings</button>
      </div>
    )
  }

  const selectedRegion: Region = regionOf(getOffice(state, selected) ?? state.offices[0])
  const narrow = width < TWO_BUILDINGS_MIN_WIDTH
  const layout = buildingLayout(state, width, height, narrow ? selectedRegion : undefined)
  const showFloor = (office: Office) => {
    store.selectOffice(office.id)
    store.setView('floor')
  }

  return (
    <div ref={ref} className="building-overlay">
      {narrow && (
        <div className="building-switch segmented" role="group" aria-label="Building">
          {REGIONS.map((region) => {
            const first = officesIn(state, region)[0]
            return (
              <button
                key={region}
                className={region === selectedRegion ? 'active' : ''}
                aria-pressed={region === selectedRegion}
                onClick={() => (first ? store.selectOffice(first.id) : store.openDialog({ kind: 'team' }))}
              >
                {buildingName(region)}
                {!first && <small> · not yet</small>}
              </button>
            )
          })}
        </div>
      )}
      {layout.buildings.map((building) => {
        const roof = toScreen(layout, building.roof)
        const floors = building.floors.length
        const nextFloor = toScreen(layout, { x: building.x, y: building.roof.y - FLOOR_H, w: building.w, h: FLOOR_H })
        const canAdd = floors < REGION_OFFICE_LIMIT && openOfficeBlocker(state, building.region) !== 'The studio is not ready yet'
        return (
          <div key={building.region}>
            {building.open ? (
              <div className="building-sign" style={at(roof)}>
                {buildingName(building.region)}
              </div>
            ) : (
              <button className="building-lot" style={at(toScreen(layout, { x: building.x, y: building.lobby.y - 60, w: building.w, h: 60 + building.lobby.h }))} onClick={() => store.openDialog({ kind: 'team' })}>
                A lot in {building.region === 'eu' ? 'Europe' : 'the US'}
                <small>{openOfficeBlocker(state, building.region) === 'The studio is not ready yet' ? 'Open a building here once the studio is established' : 'Open a building here…'}</small>
              </button>
            )}
            {building.open && canAdd && (
              <button className="building-add" style={at(nextFloor)} onClick={() => store.openDialog({ kind: 'team' })}>
                + Add floor {floors + 1}
              </button>
            )}
            {building.floors.map((box) => {
              const office = getOffice(state, box.officeId)
              if (!office) return null
              const screen = toScreen(layout, box)
              const plate = toScreen(layout, { x: box.x, y: box.y, w: box.w, h: WALL_BAND })
              return (
                <button
                  key={box.officeId}
                  className={`building-floor ${office.id === selected ? 'selected' : ''}`}
                  style={at(screen)}
                  title={`Go into ${officeName(state, office)}`}
                  onClick={() => showFloor(office)}
                >
                  <span className="floor-plate" style={{ maxWidth: plate.w * 0.7 }}>
                    <strong>{officeName(state, office)}</strong> {floorStatus(state, office)}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
