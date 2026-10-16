import { describe, expect, it, vi } from 'vitest'
import { createSfx, MUTE_KEY, silentSfx, SOUNDS, type AudioContextLike, type Sfx, type SfxPlayer } from '@/lib/tycoon/audio'
import type { KeyValueStorage } from '@/lib/tycoon/save'
import { advanceDay } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { startProject } from '@/lib/tycoon/sim/project'
import { createStore } from '@/lib/tycoon/store'
import { makeEmployee, makeState, richState } from './helpers'

class FakeParam {
  value = 0
  calls: [string, number, number][] = []
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t])
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['linear', v, t])
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(['exp', v, t])
  }
}

class FakeNode {
  connected: unknown[] = []
  disconnected = false
  connect(destination: unknown) {
    this.connected.push(destination)
  }
  disconnect() {
    this.disconnected = true
  }
}

class FakeOscillator extends FakeNode {
  type = ''
  frequency = new FakeParam()
  onended: (() => void) | null = null
  started: number | null = null
  stopped: number | null = null
  start(t: number) {
    this.started = t
  }
  stop(t: number) {
    this.stopped = t
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeContext implements AudioContextLike {
  currentTime = 5
  state = 'running'
  destination = { name: 'speakers' }
  oscillators: FakeOscillator[] = []
  gains: FakeGain[] = []
  resumed = 0
  createOscillator() {
    const o = new FakeOscillator()
    this.oscillators.push(o)
    return o
  }
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
  async resume() {
    this.resumed += 1
    this.state = 'running'
  }
}

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
}

function setup(storage: KeyValueStorage | null = new MemoryStorage()) {
  const context = new FakeContext()
  const create = vi.fn(() => context)
  const sfx = createSfx({ storage, create })
  return { sfx, context, create, storage }
}

describe('sound definitions', () => {
  it('every sound is short, audible, and made of sensible notes', () => {
    for (const [name, notes] of Object.entries(SOUNDS)) {
      expect(notes.length, name).toBeGreaterThan(0)
      for (const n of notes) {
        expect(n.freq, name).toBeGreaterThanOrEqual(80)
        expect(n.freq, name).toBeLessThanOrEqual(2400)
        expect(n.dur, name).toBeGreaterThanOrEqual(0.03)
        expect(n.at, name).toBeGreaterThanOrEqual(0)
        expect(n.gain ?? 1, name).toBeGreaterThan(0)
        expect(n.gain ?? 1, name).toBeLessThanOrEqual(1)
      }
      const length = Math.max(...notes.map((n) => n.at + n.dur))
      expect(length, name).toBeLessThanOrEqual(1)
    }
  })
})

describe('createSfx', () => {
  it('makes no context, and no sound, until a user gesture unlocks it', () => {
    const { sfx, create, context } = setup()
    sfx.play('ship')
    expect(create).not.toHaveBeenCalled()
    expect(context.oscillators).toHaveLength(0)

    sfx.unlock()
    expect(create).toHaveBeenCalledTimes(1)
    sfx.unlock()
    sfx.play('ship')
    expect(create).toHaveBeenCalledTimes(1) // one context for the whole session
  })

  it('plays every note of a sound, scheduled from the context clock', () => {
    const { sfx, context } = setup()
    sfx.unlock()
    sfx.play('hire')
    expect(context.oscillators).toHaveLength(SOUNDS.hire.length)
    SOUNDS.hire.forEach((note, i) => {
      const osc = context.oscillators[i]
      expect(osc.frequency.calls[0]).toEqual(['set', note.freq, 5 + note.at])
      expect(osc.started).toBeCloseTo(5 + note.at)
      expect(osc.stopped).toBeGreaterThan(5 + note.at + note.dur)
      expect(osc.type).toBe(note.type ?? 'sine')
    })
  })

  it('shapes each note with a quick attack and a decay to near silence, with no clicks', () => {
    const { sfx, context } = setup()
    sfx.unlock()
    sfx.play('ship')
    const envelope = context.gains[1] // gains[0] is the master volume
    const kinds = envelope.gain.calls.map(([kind]) => kind)
    expect(kinds).toEqual(['set', 'linear', 'exp'])
    expect(envelope.gain.calls[0][1]).toBeGreaterThan(0) // exponential ramps can't start at zero
    expect(envelope.gain.calls[2][1]).toBeGreaterThan(0)
    expect(envelope.gain.calls[2][1]).toBeLessThan(0.001)
  })

  it('routes notes through one quiet master volume to the speakers', () => {
    const { sfx, context } = setup()
    sfx.unlock()
    sfx.play('event')
    const master = context.gains[0]
    expect(master.gain.value).toBeGreaterThan(0)
    expect(master.gain.value).toBeLessThan(0.3)
    expect(master.connected).toEqual([context.destination])
    for (const gain of context.gains.slice(1)) expect(gain.connected).toEqual([master])
  })

  it('cleans up each note when it ends', () => {
    const { sfx, context } = setup()
    sfx.unlock()
    sfx.play('click')
    const osc = context.oscillators[0]
    expect(osc.disconnected).toBe(false)
    osc.onended?.()
    expect(osc.disconnected).toBe(true)
    expect(context.gains[1].disconnected).toBe(true)
  })

  it('can play every named sound', () => {
    const { sfx, context } = setup()
    sfx.unlock()
    for (const name of Object.keys(SOUNDS) as Sfx[]) sfx.play(name)
    expect(context.oscillators).toHaveLength(Object.values(SOUNDS).reduce((n, notes) => n + notes.length, 0))
  })

  it('resumes a context the browser left suspended', () => {
    const { sfx, context } = setup()
    context.state = 'suspended'
    sfx.unlock()
    expect(context.resumed).toBe(1)
    context.state = 'suspended'
    sfx.play('click')
    expect(context.resumed).toBe(2)
  })

  it('survives having no audio at all, or a context that throws', () => {
    const none = createSfx({ storage: null, create: () => null })
    none.unlock()
    expect(() => none.play('ship')).not.toThrow()

    const broken = createSfx({
      storage: null,
      create: () => {
        throw new Error('no audio here')
      },
    })
    broken.unlock()
    expect(() => broken.play('ship')).not.toThrow()
    expect(() => silentSfx().play('ship')).not.toThrow()
  })
})

describe('muting', () => {
  it('silences everything, remembers the choice, and comes back when unmuted', () => {
    const { sfx, context, storage } = setup()
    sfx.unlock()
    sfx.setMuted(true)
    expect(sfx.muted.value).toBe(true)
    expect(storage!.getItem(MUTE_KEY)).toBe('1')
    sfx.play('ship')
    expect(context.oscillators).toHaveLength(0)

    sfx.setMuted(false)
    expect(storage!.getItem(MUTE_KEY)).toBe('0')
    sfx.play('ship')
    expect(context.oscillators).toHaveLength(SOUNDS.ship.length)
  })

  it('starts muted when it was muted last time', () => {
    const storage = new MemoryStorage()
    storage.setItem(MUTE_KEY, '1')
    const { sfx, context } = setup(storage)
    expect(sfx.muted.value).toBe(true)
    sfx.unlock()
    sfx.play('ship')
    expect(context.oscillators).toHaveLength(0)
  })

  it('copes with storage that throws', () => {
    const angry: KeyValueStorage = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
      removeItem() {},
    }
    const sfx = createSfx({ storage: angry, create: () => new FakeContext() })
    expect(sfx.muted.value).toBe(false)
    expect(() => sfx.setMuted(true)).not.toThrow()
    expect(sfx.muted.value).toBe(true)
  })
})

/** A player that records what it was asked to play. */
function recorder(): SfxPlayer & { played: Sfx[] } {
  const played: Sfx[] = []
  return { ...silentSfx(), played, play: (s) => void played.push(s) }
}

describe('the store asks for sounds at the right moments', () => {
  it('plays a sound for a successful command, and stays silent for a refused one', () => {
    const sfx = recorder()
    const store = createStore(richState(), 0, { sfx })
    const candidate = store.state.candidates[0]
    expect(store.hire(candidate.id).ok).toBe(true)
    expect(sfx.played).toEqual(['hire'])

    expect(store.hire(-1).ok).toBe(false)
    expect(store.fire(999).ok).toBe(false)
    expect(sfx.played).toEqual(['hire']) // nothing for the failures

    store.state.money = 1_000_000
    store.state.stage = 3
    store.openOffice()
    expect(sfx.played).toEqual(['hire', 'upgrade'])
  })

  it('plays the ship fanfare when a product goes out', () => {
    const sfx = recorder()
    const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })], 5)
    const store = createStore(state, 0, { sfx })
    store.startProject('web_app', [])
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d]
    store.shipProject()
    expect(sfx.played).toEqual(['click', 'ship'])
  })

  it('plays an alert for an event, a chime for "ready", and a low note for bankruptcy', () => {
    const sfx = recorder()
    const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })], 5)
    const store = createStore(state, 2, { sfx })
    startProject(state, 'web_app', [])
    state.offices[0].project!.progress = { ...state.offices[0].project!.target }
    state.offices[0].project!.progress.engineering -= 0.001
    state.pendingEvent = { id: 'press', data: {} }
    state.events.push({ type: 'randomEvent' })
    for (let i = 0; i < 12 && store.dialog.value === null; i++) store.tick(250)
    expect(sfx.played).toEqual(['event', 'ready'])

    const broke = makeState([makeEmployee(1, {}, 3000)])
    broke.money = -1
    const bankrupt = recorder()
    const store2 = createStore(broke, 2, { sfx: bankrupt })
    store2.state.debtDays = 13
    for (let i = 0; i < 12 && !broke.gameOver; i++) store2.tick(250)
    advanceDay(broke)
    expect(bankrupt.played).toContain('bad')
  })

  it('plays the milestone and research jingles that the simulation asks for', () => {
    const sfx = recorder()
    const state = makeState([makeEmployee(1)])
    const store = createStore(state, 1, { sfx })
    state.events.push({ type: 'notice', text: 'Milestone: Hello', sound: 'milestone' })
    state.events.push({ type: 'notice', text: 'Research complete: CI', sound: 'research' })
    state.events.push({ type: 'notice', text: 'Mobile demand is cooling' }) // news without a jingle
    for (let i = 0; i < 6; i++) store.tick(250)
    expect(sfx.played).toEqual(['milestone', 'research'])
  })

  it('has its own sounds for a hit, a new era, a stage and a deal', () => {
    const sfx = recorder()
    const state = makeState([makeEmployee(1)])
    const store = createStore(state, 1, { sfx })
    state.events.push({ type: 'notice', text: 'You bought Somebody.', sound: 'deal' })
    state.events.push({ type: 'breakout', productId: 1 })
    state.events.push({ type: 'era', era: 2 })
    state.events.push({ type: 'stage', stage: 1 })
    for (let i = 0; i < 6; i++) store.tick(250)
    expect(sfx.played).toEqual(['deal', 'hit', 'era', 'milestone'])
    for (const name of ['hit', 'era', 'deal'] as const) expect(SOUNDS[name].length).toBeGreaterThan(0)
  })
})
