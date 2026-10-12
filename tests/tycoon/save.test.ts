import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOSAVE_MS,
  BACKUP_KEY,
  clearSave,
  createAutosave,
  importSave,
  loadGame,
  SAVE_KEY,
  saveGame,
  type KeyValueStorage,
} from '@/lib/tycoon/save'
import { startProject } from '@/lib/tycoon/sim/project'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { advance } from '@/lib/tycoon/sim/tick'
import { createStore } from '@/lib/tycoon/store'
import { makeEmployee, makeState } from './helpers'

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>()
  writes = 0
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.writes += 1
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
}

const brokenStorage: KeyValueStorage = {
  getItem() {
    throw new Error('denied')
  },
  setItem() {
    throw new Error('quota')
  },
  removeItem() {
    throw new Error('denied')
  },
}

function playedState() {
  const state = createInitialState(5)
  startProject(state, 'web_app', ['accounts'])
  advance(state, 12)
  return state
}

describe('saveGame / loadGame', () => {
  it('restores what was saved', () => {
    const storage = new MemoryStorage()
    const state = playedState()
    expect(saveGame(state, storage)).toBe(true)
    expect(loadGame(storage)).toEqual({ ...state, dayWork: [], events: [] })
  })

  it('returns null when there is no save', () => {
    expect(loadGame(new MemoryStorage())).toBeNull()
  })

  it('keeps an unreadable save as a backup and starts fresh', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, '{"version":1,"oops":true}')
    expect(loadGame(storage)).toBeNull()
    expect(storage.getItem(BACKUP_KEY)).toBe('{"version":1,"oops":true}')
  })

  it('ignores a save from a finished game', () => {
    const storage = new MemoryStorage()
    const state = playedState()
    state.gameOver = true
    saveGame(state, storage)
    expect(loadGame(storage)).toBeNull()
    expect(storage.getItem(BACKUP_KEY)).toBeNull()
  })

  it('survives a storage that throws', () => {
    expect(saveGame(playedState(), brokenStorage)).toBe(false)
    expect(loadGame(brokenStorage)).toBeNull()
    expect(() => clearSave(brokenStorage)).not.toThrow()
  })

  it('clearSave removes the save', () => {
    const storage = new MemoryStorage()
    saveGame(playedState(), storage)
    clearSave(storage)
    expect(loadGame(storage)).toBeNull()
  })
})

describe('importSave', () => {
  it('stores a valid export so loadGame returns it', () => {
    const storage = new MemoryStorage()
    const state = playedState()
    expect(importSave(serialize(state), storage).ok).toBe(true)
    expect(loadGame(storage)?.day).toBe(state.day)
  })

  it.each([
    ['garbage', 'not json'],
    ['wrong shape', '{"version":1}'],
    ['another version', JSON.stringify({ ...createInitialState(1), version: 1 })],
  ])('rejects %s without writing anything', (_label, text) => {
    const storage = new MemoryStorage()
    expect(importSave(text, storage).ok).toBe(false)
    expect(storage.writes).toBe(0)
  })

  it('rejects a finished game', () => {
    const storage = new MemoryStorage()
    const state = playedState()
    state.gameOver = true
    expect(importSave(serialize(state), storage).ok).toBe(false)
    expect(storage.writes).toBe(0)
  })

  it('reports a storage failure', () => {
    expect(importSave(serialize(playedState()), brokenStorage).ok).toBe(false)
  })
})

describe('createAutosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = () => {
    const storage = new MemoryStorage()
    const store = createStore(makeState([makeEmployee(100, { engineering: 50 })]), 0)
    const autosave = createAutosave(store, storage)
    return { storage, store, autosave }
  }

  it('saves shortly after start, then once per window however often the game changes', () => {
    const { storage, store } = setup()
    expect(storage.writes).toBe(0)
    vi.advanceTimersByTime(AUTOSAVE_MS)
    expect(storage.writes).toBe(1)

    for (let i = 0; i < 9; i++) {
      store.version.value += 1
      vi.advanceTimersByTime(AUTOSAVE_MS / 10)
    }
    expect(storage.writes).toBe(1)
    vi.advanceTimersByTime(AUTOSAVE_MS)
    expect(storage.writes).toBe(2)
  })

  it('keeps saving while changes never stop (not a debounce)', () => {
    const { storage, store } = setup()
    for (let i = 0; i < 50; i++) {
      store.version.value += 1
      vi.advanceTimersByTime(AUTOSAVE_MS / 5)
    }
    expect(storage.writes).toBeGreaterThanOrEqual(8)
  })

  it('flush writes immediately when dirty and is a no-op when clean', () => {
    const { storage, autosave } = setup()
    autosave.flush()
    expect(storage.writes).toBe(1)
    autosave.flush()
    expect(storage.writes).toBe(1)
    vi.advanceTimersByTime(AUTOSAVE_MS * 3)
    expect(storage.writes).toBe(1)
  })

  it('stop cancels the pending write and later changes', () => {
    const { storage, store, autosave } = setup()
    autosave.stop()
    store.version.value += 1
    vi.advanceTimersByTime(AUTOSAVE_MS * 3)
    expect(storage.writes).toBe(0)
  })

  it('deletes the save when the game is over', () => {
    const { storage, store } = setup()
    vi.advanceTimersByTime(AUTOSAVE_MS)
    expect(storage.getItem(SAVE_KEY)).not.toBeNull()

    store.state.gameOver = true
    store.version.value += 1
    vi.advanceTimersByTime(AUTOSAVE_MS)
    expect(storage.getItem(SAVE_KEY)).toBeNull()
  })
})
