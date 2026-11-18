import { describe, expect, it, vi, afterEach } from 'vitest'
import { bootCareer } from '@/lib/tycoon/career-bootstrap'
import { createCareerController } from '@/lib/tycoon/career-controller'
import { createCareerSave, deserializeCareerSave, serializeCareerSave } from '@/lib/tycoon/career-save'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { startProject } from '@/lib/tycoon/sim/project'
import { SAVE_KEY, LEGACY_SAVE_KEY, BACKUP_KEY, saveGame, clearSave } from '@/lib/tycoon/save'
import { startNewGame, startNextChapter, importSaveFile } from '@/lib/tycoon/browser'
import { HeldLock, MemoryStorage, SerialLock, identity, unwrap } from './career-persistence-fixtures'
const options = { id: (() => { let n = 0; return () => `boot-${++n}` })(), seed: 42 }
const read = (s: MemoryStorage) => unwrap(deserializeCareerSave(s.getItem(SAVE_KEY)!))
afterEach(() => vi.unstubAllGlobals())
describe('live career bootstrap', () => {
  it('initializes a genuine named-later career once, paused, without a private reserve', async () => {
    const storage = new MemoryStorage(), lock = new SerialLock()
    const boot = await bootCareer(storage, lock, options)
    expect(boot.ok).toBe(true)
    if (!boot.ok) return
    const c = createCareerController(boot.owner)
    expect(c.store.speed.value).toBe(0)
    expect(c.store.dialog.value?.kind).toBe('founding')
    expect(unwrap(c.summary()).liquid).toBe(0)
    expect(storage.writes).toBe(1)
    c.stop()
  })
  it('adopts v11 without losing paid project progress, RNG, people or money', async () => {
    const storage = new MemoryStorage(), lock = new SerialLock(), game = createInitialState(5)
    game.money = 100000; expect(startProject(game, 'web_app', ['accounts']).ok).toBe(true)
    game.offices[0].project!.progress.engineering = 7
    const raw = serialize(game); storage.setItem(SAVE_KEY, raw)
    expect((await bootCareer(storage, lock, options)).ok).toBe(true)
    expect(read(storage).game.money).toBe(game.money)
    expect(read(storage).game.rng).toBe(game.rng)
    expect(read(storage).game.employees).toEqual(game.employees)
    expect(read(storage).game.offices[0].project?.progress.engineering).toBe(7)
    expect(read(storage).finance.records).toHaveLength(1)
  })
  it('leaves ended legacy decisions uncredited through repeated loads', async () => {
    const storage = new MemoryStorage(), lock = new SerialLock(), game = createInitialState(5)
    game.day = 500; game.gameOver = true; game.ending = { kind: 'ipo', day: 500, worth: 100000000 }
    storage.setItem(SAVE_KEY, serialize(game))
    expect((await bootCareer(storage, lock, options)).ok).toBe(true)
    const first = storage.getItem(SAVE_KEY)
    expect((await bootCareer(storage, lock, options)).ok).toBe(true)
    expect(storage.getItem(SAVE_KEY)).toBe(first)
    expect(read(storage).finance.records.map((r) => r.kind)).toEqual(['origin'])
  })
  it('settles a native pending ending exactly once at resume', async () => {
    const storage = new MemoryStorage(), lock = new SerialLock()
    const s = unwrap(createCareerSave(createInitialState(5), identity))
    s.game.day = 500; s.game.gameOver = true; s.game.ending = { kind: 'ipo', day: 500, worth: 100000000 }
    storage.setItem(SAVE_KEY, unwrap(serializeCareerSave(s)))
    expect((await bootCareer(storage, lock, options)).ok).toBe(true)
    expect(read(storage).finance.records.at(-1)?.kind).toBe('settlement')
    const before = storage.getItem(SAVE_KEY)
    expect((await bootCareer(storage, lock, options)).ok).toBe(true)
    expect(storage.getItem(SAVE_KEY)).toBe(before)
  })
  it.each(['{bad', '{"version":99}', '{"version":12,"game":{}}', 'null'])('preserves unsupported/corrupt file %s and any backup', async (raw) => {
    const storage = new MemoryStorage(); storage.setItem(SAVE_KEY, raw); storage.setItem(BACKUP_KEY, 'backup'); storage.writes = 0
    const boot = await bootCareer(storage, new SerialLock(), options)
    expect(boot.ok).toBe(false)
    if (!boot.ok) expect(boot.raw).toBe(raw)
    expect(storage.getItem(SAVE_KEY)).toBe(raw)
    expect(storage.getItem(BACKUP_KEY)).toBe('backup')
    expect(storage.writes).toBe(0)
  })
  it('retains standalone source while migrating under the same lock', async () => {
    const storage = new MemoryStorage(), raw = serialize(createInitialState(5))
    storage.setItem(LEGACY_SAVE_KEY, raw)
    expect((await bootCareer(storage, new SerialLock(), options)).ok).toBe(true)
    expect(storage.getItem(LEGACY_SAVE_KEY)).toBe(raw)
    expect(read(storage).finance.records[0].kind).toBe('origin')
  })
  it('never creates an unlocked/blocked-storage fallback game', async () => {
    const storage = new MemoryStorage()
    expect((await bootCareer(storage, null, options)).ok).toBe(false)
    storage.failRead = true
    expect((await bootCareer(storage, new SerialLock(), options)).ok).toBe(false)
    expect((await bootCareer(null, new SerialLock(), options)).ok).toBe(false)
    expect(storage.writes).toBe(0)
  })
  it('cancels a lock-waiting initialization on disposal', async () => {
    const storage = new MemoryStorage(), lock = new HeldLock(), abort = new AbortController()
    const pending = bootCareer(storage, lock, { ...options, signal: abort.signal })
    await lock.entered.promise; abort.abort(); lock.gate.resolve()
    expect((await pending).ok).toBe(false)
    expect(storage.writes).toBe(0)
  })
  it('prevents preview/legacy browser paths from overwriting or clearing v12', async () => {
    const storage = new MemoryStorage(), raw = unwrap(serializeCareerSave(unwrap(createCareerSave(createInitialState(5), identity))))
    storage.setItem(SAVE_KEY, raw); storage.writes = 0
    vi.stubGlobal('window', { localStorage: storage })
    expect(startNewGame().ok).toBe(false)
    expect(startNextChapter(createInitialState(5)).ok).toBe(false)
    expect((await importSaveFile({} as File)).ok).toBe(false)
    expect(saveGame(createInitialState(7), storage)).toBe(false)
    clearSave(storage)
    expect(storage.getItem(SAVE_KEY)).toBe(raw)
    expect(storage.writes).toBe(0)
  })
})
