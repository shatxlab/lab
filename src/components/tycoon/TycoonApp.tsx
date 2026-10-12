import { useEffect, useRef, useState } from 'react'
import type { Store } from '@/lib/tycoon/store'
import { App } from './App'
import { browserStorage, setAutosave } from '@/lib/tycoon/browser'
import { createSfx } from '@/lib/tycoon/audio'
import { applyDevParams, hasDevParams } from '@/lib/tycoon/dev'
import { createAutosave, loadGame, migrateLegacySave } from '@/lib/tycoon/save'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { createStore } from '@/lib/tycoon/store'

/**
 * The tycoon island's bootstrap: the standalone game's `main()` as a React component.
 * All service-worker / manifest wiring from the original stays out — the lab has its
 * own PWA layer and install flow.
 */
export default function TycoonApp() {
  const [store, setStore] = useState<Store | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // One-time legacy save carry-over, before anything reads the save keys.
    const storage = import.meta.env.DEV && hasDevParams() ? null : browserStorage()
    if (storage) migrateLegacySave(storage)

    // Dev shortcut URLs get a throwaway game and never touch the real save.
    const sandbox = import.meta.env.DEV && hasDevParams()
    const saved = sandbox ? null : (storage ? loadGame(storage) : null)
    const state = saved ?? createInitialState(Date.now())
    if (sandbox) applyDevParams(state)

    // Sound is synthesized in the browser; it can only start after the player's first click or key press.
    const sfx = createSfx({ storage: browserStorage(), create: () => new AudioContext() })
    const unlock = () => sfx.unlock()
    const gestures = ['pointerdown', 'keydown'] as const
    for (const gesture of gestures) window.addEventListener(gesture, unlock, { once: true })

    // A resumed game starts paused (speed 0) so nothing happens before the player is ready.
    const next = createStore(state, 0, { sfx })
    if (!saved) next.openDialog({ kind: 'new-project' })
    setStore(next)

    if (storage) {
      const autosave = createAutosave(next, storage)
      setAutosave(autosave)
      const flush = () => autosave.flush()
      window.addEventListener('pagehide', flush)
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') autosave.flush()
      }
      document.addEventListener('visibilitychange', onVisibility)
      return () => {
        window.removeEventListener('pagehide', flush)
        document.removeEventListener('visibilitychange', onVisibility)
        for (const gesture of gestures) window.removeEventListener(gesture, unlock)
        autosave.stop()
      }
    }
    return () => {
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
      const [{ Application }, { loadAtlas }, { OfficeScene }] = await Promise.all([
        import('pixi.js'),
        import('@/lib/tycoon/render/atlas'),
        import('@/lib/tycoon/render/OfficeScene'),
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
      const scene = new OfficeScene(
        app,
        atlas,
        () => store.state,
        () => store.selectedOffice.value,
        (id) => store.openDialog({ kind: 'employee', id }),
      )
      app.stage.addChild(scene.view, scene.popups)

      const layout = () => scene.layout(app.screen.width, app.screen.height)
      app.renderer.on('resize', layout)
      const observer = new ResizeObserver(() => app.renderer.resize(host.clientWidth, host.clientHeight))
      observer.observe(host)
      layout()

      app.ticker.add((ticker) => {
        store.tick(ticker.deltaMS)
        scene.update(ticker.deltaMS, store.running() ? store.speed.value : 0)
      })

      dispose = () => {
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
      {store && <App store={store} />}
    </div>
  )
}
