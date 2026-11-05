import { useEffect, useRef, useState } from 'react'
import type { Store } from '@/lib/tycoon/store'
import { App } from './App'
import { browserStorage } from '@/lib/tycoon/browser'
import { bootCareer, type CareerBoot } from '@/lib/tycoon/career-bootstrap'
import { createCareerController, type CareerController } from '@/lib/tycoon/career-controller'
import { browserCareerLock, type ExclusiveSaveLock } from '@/lib/tycoon/career-transactions'
import type { KeyValueStorage } from '@/lib/tycoon/save'
import { CareerRecovery } from './CareerRecovery'
import { createSfx } from '@/lib/tycoon/audio'
import { applyDevParams, devClock, hasDevParams } from '@/lib/tycoon/dev'
import { companyOverview, getOffice, regionOf } from '@/lib/tycoon/sim/offices'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { overallProgress } from '@/lib/tycoon/sim/scoring'
import { routineAt } from '@/lib/tycoon/render-support/routines'
import { SeatMap } from '@/lib/tycoon/render-support/seats'
import { createStore } from '@/lib/tycoon/store'

/**
 * The tycoon island's bootstrap: the standalone game's `main()` as a React component.
 * All service-worker / manifest wiring from the original stays out — the lab has its
 * own PWA layer and install flow.
 */
export default function TycoonApp() {
  const [store, setStore] = useState<Store | null>(null)
  const [career, setCareer] = useState<CareerController | undefined>()
  const [recovery, setRecovery] = useState<{ failure: Extract<CareerBoot, { ok: false }>; storage: KeyValueStorage | null; lock: ExclusiveSaveLock | null } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sandbox = import.meta.env.DEV && hasDevParams()
    const storage = sandbox ? null : browserStorage(), lock = sandbox ? null : browserCareerLock()
    const abort = new AbortController()
    let active: CareerController | undefined
    const sfx = createSfx({ storage, create: () => new AudioContext() })
    const unlock = () => sfx.unlock()
    const gestures = ['pointerdown', 'keydown'] as const
    for (const gesture of gestures) window.addEventListener(gesture, unlock, { once: true })
    const flush = () => { if (active) void active.flush() }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibility)
    if (sandbox) {
      const state = createInitialState(Date.now()); applyDevParams(state)
      setStore(createStore(state, 0, { sfx })) // No storage writer, including sandbox menu actions.
    } else void (async () => {
      const boot = await bootCareer(storage, lock, { signal: abort.signal })
      if (abort.signal.aborted) { if (boot.ok) boot.owner.stop(); return }
      if (!boot.ok) { setRecovery({ failure: boot, storage, lock }); return }
      active = createCareerController(boot.owner, { sfx, onReplace: () => location.reload() })
      setCareer(active); setStore(active.store)
    })()
    return () => {
      abort.abort(); active?.stop()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', visibility)
      for (const gesture of gestures) window.removeEventListener(gesture, unlock)
    }
  }, [])

  // The scene boots in a separate effect so pixi.js stays out of the initial island chunk.
  useEffect(() => {
    if (!store) return
    let destroyed = false
    let dispose: (() => void) | null = null

    void (async () => {
      const host = rootRef.current?.querySelector<HTMLDivElement>('#scene-host')
      if (!host || destroyed) return

      // pixi and the renderer load together here, so the island's initial chunk stays small.
      // 'pixi.js/unsafe-eval' swaps pixi's runtime-compiled shader helpers for precompiled ones: the
      // site CSP forbids unsafe-eval, and without it the renderer throws and the scene stays black.
      const [{ Application }, { loadAtlas }, { OfficeScene }, { BuildingScene }] = await Promise.all([
        import('pixi.js'),
        import('@/lib/tycoon/render/atlas'),
        import('@/lib/tycoon/render/OfficeScene'),
        import('@/lib/tycoon/render/BuildingScene'),
        import('pixi.js/unsafe-eval'),
      ])
      if (destroyed) return
      const app = new Application()
      await app.init({
        width: host.clientWidth,
        height: host.clientHeight,
        // The room fills the whole area; this only shows for a moment while the art loads.
        background: '#14141f',
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio,
        roundPixels: true,
      })
      host.appendChild(app.canvas)

      const atlas = await loadAtlas()
      if (destroyed) {
        void app.destroy(true, { children: true })
        return
      }
      // Stand-ups and coffee breaks keep the time the game has been running, the same on the street and up close.
      let routineMs = import.meta.env.DEV ? devClock() : 0
      const routineOf = (officeId: number) => {
        const office = getOffice(store.state, officeId)
        return office?.kind === 'office' ? routineAt(routineMs, office.id)?.routine : undefined
      }
      // Who sits where, shared by both views.
      const seatMaps = new Map<number, SeatMap>()
      const scene = new OfficeScene(
        app,
        atlas,
        () => store.state,
        () => store.selectedOffice.value,
        (id) => store.openDialog({ kind: 'employee', id }),
        {
          standup: () => routineOf(store.selectedOffice.value) === 'standup',
          breaks: () => routineOf(store.selectedOffice.value) === 'break',
          boardProgress: () => {
            const project = getOffice(store.state, store.selectedOffice.value)?.project
            return project ? overallProgress(project) : 0
          },
          seatMaps,
        },
      )
      const building = new BuildingScene(
        app,
        atlas,
        () => store.state,
        () => regionOf(getOffice(store.state, store.selectedOffice.value) ?? store.state.offices[0]),
        () => routineMs,
        seatMaps,
      )
      app.stage.addChild(scene.view, scene.popups, building.view)

      const layout = () => {
        scene.layout(app.screen.width, app.screen.height)
        building.layout(app.screen.width, app.screen.height)
      }
      app.renderer.on('resize', layout)
      const observer = new ResizeObserver(() => app.renderer.resize(host.clientWidth, host.clientHeight))
      observer.observe(host)
      layout()

      app.ticker.add((ticker) => {
        store.tick(ticker.deltaMS)
        const speed = store.running() ? store.speed.value : 0
        if (speed > 0) routineMs += ticker.deltaMS
        // One of the two is on screen: the buildings from the street, or the floor (or garage) up close.
        const street = companyOverview(store.state)
        building.view.visible = street
        scene.view.visible = !street
        scene.popups.visible = !street
        if (street) building.update(ticker.deltaMS, speed)
        else scene.update(ticker.deltaMS, speed)
      })

      // Expose actual first-frame readiness, not merely an attached (still empty) canvas.
      app.ticker.addOnce(() => { if (!destroyed) host.dataset.renderReady = 'true' }, undefined, -100)

      dispose = () => {
        delete host.dataset.renderReady
        observer.disconnect()
        void app.destroy(true, { children: true })
      }
    })()

    return () => {
      destroyed = true
      dispose?.()
    }
  }, [store])

  return (
    // The game keeps its own dark palette regardless of the lab theme; see styles/tycoon.css.
    <div ref={rootRef} className="tycoon-root">
      {recovery ? <CareerRecovery {...recovery} /> : store ? <App store={store} career={career} /> : <p role="status">Loading saved career…</p>}
    </div>
  )
}
