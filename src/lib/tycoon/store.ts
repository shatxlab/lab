import { signal, type Signal } from './signals'
import { silentSfx, type SfxPlayer } from '@/lib/tycoon/audio'
import { promote } from '@/lib/tycoon/sim/careers'
import { abandonContract, acceptContract } from '@/lib/tycoon/sim/contracts'
import { resolveRandomEvent } from '@/lib/tycoon/sim/events'
import { clearOnCall, setOnCall, startFix, stopFix } from '@/lib/tycoon/sim/fixes'
import { fire, hire } from '@/lib/tycoon/sim/hiring'
import { promoteProduct } from '@/lib/tycoon/sim/lifecycle'
import { getOffice, moveOut, openOffice, transfer } from '@/lib/tycoon/sim/offices'
import { acquire } from '@/lib/tycoon/sim/rivals'
import { sunsetProduct } from '@/lib/tycoon/sim/sunset'
import { shipProject, startProject, startUpdate, unlockedProductTypes } from '@/lib/tycoon/sim/project'
import { startResearch } from '@/lib/tycoon/sim/research'
import { startTraining, teamOuting } from '@/lib/tycoon/sim/staff'
import { isReady } from '@/lib/tycoon/sim/scoring'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import type { Discipline, GameState, ProjectSize, Result, SimEvent, Tier } from '@/lib/tycoon/sim/types'

export type Speed = 0 | 1 | 2
export const SPEEDS: readonly Speed[] = [0, 1, 2]

/** Real milliseconds per game day at 1x. */
export const MS_PER_DAY = 1500
/** A long frame (e.g. a backgrounded tab) never fast-forwards more than this. */
const MAX_FRAME_MS = 250
const TOAST_MS = 6000

export type Dialog =
  | null
  /** Plans work for an office (the selected one if left out); `updateOf` is a product id: plan an update to it instead. */
  | { kind: 'new-project'; officeId?: number; updateOf?: number }
  | { kind: 'ship'; officeId: number }
  | { kind: 'ready'; officeId: number }
  | { kind: 'event' }
  /** The studio reached a new stage of its journey. */
  | { kind: 'stage'; stage: number }
  /** A launch broke out. */
  | { kind: 'breakout'; productId: number }
  /** A new era began. */
  | { kind: 'era'; era: number }
  | {
      kind: 'result'
      productId: number
      reputationDelta: number
      early: boolean
      unlocked: string[]
      update: boolean
      /** Users the product can now reach, and the bugs this release shipped with. */
      reach: number
      bugs: number
      quality: number
    }
  /** Products, stats and milestones in one place. */
  | { kind: 'studio'; tab?: 'journey' | 'products' | 'industry' | 'stats' | 'milestones' }
  | { kind: 'team' }
  /** One person's details: skills, trait, morale, training. */
  | { kind: 'employee'; id: number }
  | { kind: 'research' }
  | { kind: 'menu' }
  | { kind: 'game-over' }

export interface Toast {
  id: number
  text: string
}

export interface Store {
  /** The live game state. Mutated in place by the sim; read it after touching `version`. */
  readonly state: GameState
  /** Bumped after every change to `state`; components read it to re-render. */
  readonly version: Signal<number>
  readonly speed: Signal<Speed>
  readonly dialog: Signal<Dialog>
  /** Short-lived news (market shifts, event outcomes); they remove themselves. */
  readonly toasts: Signal<Toast[]>
  /** The office on screen; commands without an office act on it. */
  readonly selectedOffice: Signal<number>
  /** Sound effects and the mute switch. */
  readonly sfx: SfxPlayer
  /** True while game days are actually passing. */
  running(): boolean
  /** Advances the game by `dtMs` of real time. Call once per frame. */
  tick(dtMs: number): void
  setSpeed(speed: Speed): void
  openDialog(dialog: Exclude<Dialog, null>): void
  closeDialog(): void
  /** Shows another office. */
  selectOffice(officeId: number): void
  /** Starts a new product of `size` (Small if left out). Like the commands below, in the selected office unless told otherwise. */
  startProject(productTypeId: string, featureIds: readonly string[], size?: ProjectSize, officeId?: number): Result
  /** Ships an office's project; `campaign` buys launch marketing for a new product. */
  shipProject(campaign?: Tier, officeId?: number): Result
  startUpdate(productId: number, featureIds: readonly string[], officeId?: number): Result
  /** Sends a developer and a tester to fix a live product's bugs. */
  startFix(productId: number, developerId: number, testerId: number): Result
  /** Ends a bug-fixing job early, keeping what it fixed. */
  stopFix(fixId: number): Result
  /** Puts a developer and a tester on call (needs Incident management): they start fixing on their own. */
  setOnCall(developerId: number, testerId: number): Result
  clearOnCall(): Result
  /** Retires a product, or sells it to a rival when it has enough users. */
  sunsetProduct(productId: number): Result
  /** Takes a client job on. */
  acceptContract(offerId: number, officeId?: number): Result
  /** Walks away from an office's client job. */
  abandonContract(officeId?: number): Result
  promote(productId: number, tier: Tier): Result
  /** Starts researching `id`; one thing at a time. */
  startResearch(id: string): Result
  /** Picks choice `index` of the pending random event. */
  resolveEvent(index: number): Result
  /** Hires into the selected office, or the first with a free desk if it is full. */
  hire(candidateId: number): Result
  /** Promotes someone a level, with the raise that comes with it. */
  promoteEmployee(employeeId: number): Result
  /** Sends an employee on a course in `discipline`; they do no project work until it ends. */
  train(employeeId: number, discipline: Discipline): Result
  teamOuting(): Result
  fire(employeeId: number): Result
  /** Leaves the garage for a real office. */
  moveOut(): Result
  /** Opens another office and shows it. */
  openOffice(): Result
  /** Moves someone to another office's team. */
  transfer(employeeId: number, officeId: number): Result
  /** Buys a rival studio and its products. */
  acquire(rivalId: number): Result
}

export function createStore(state: GameState, initialSpeed: Speed = 1, options: { sfx?: SfxPlayer } = {}): Store {
  const sfx = options.sfx ?? silentSfx()
  const version = signal(0)
  const speed = signal<Speed>(initialSpeed)
  // A game saved while an event was waiting resumes on that event.
  const dialog = signal<Dialog>(state.pendingEvent ? { kind: 'event' } : null)
  const toasts = signal<Toast[]>([])
  const selectedOffice = signal(state.offices[0].id)
  /** The office a command is for: the one named, or the one on screen. */
  const officeFor = (officeId?: number) => officeId ?? selectedOffice.value
  /** Dialogs that arrived on the same day as the one on screen; shown as each is closed. */
  let queue: Exclude<Dialog, null>[] = []
  let carryMs = 0
  let nextToastId = 1

  const bump = () => {
    version.value += 1
  }
  /** Publishes a state change made by a successful command. */
  const changed = (result: Result): Result => {
    if (result.ok) bump()
    return result
  }
  /** Plays `sound` when a command worked, and passes the result through. */
  const cue = (result: Result, sound: Parameters<SfxPlayer['play']>[0]): Result => {
    if (result.ok) sfx.play(sound)
    return result
  }
  const running = () => speed.value > 0 && dialog.value === null && !state.gameOver

  const notify = (text: string) => {
    const id = nextToastId++
    toasts.value = [...toasts.value, { id, text }]
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, TOAST_MS)
  }

  /** Puts dialogs on screen: the first now if nothing is showing, the rest as each one closes. */
  const show = (dialogs: Exclude<Dialog, null>[]) => {
    if (dialogs.length === 0) return
    if (dialog.value === null) {
      dialog.value = dialogs[0]
      queue = [...queue, ...dialogs.slice(1)]
    } else {
      queue = [...queue, ...dialogs]
    }
  }

  /**
   * Turns what happened into toasts and dialogs. Bankruptcy preempts everything, then a random event,
   * then a new stage, then "ready to ship". Returns true if a dialog opened (time should stop).
   */
  const handleEvents = (events: SimEvent[]): boolean => {
    for (const event of events) {
      if (event.type !== 'notice') continue
      notify(event.text)
      if (event.sound) sfx.play(event.sound)
    }

    const dialogs: Exclude<Dialog, null>[] = []
    if (events.some((e) => e.type === 'bankrupt')) {
      dialogs.push({ kind: 'game-over' })
      sfx.play('bad')
    } else {
      if (events.some((e) => e.type === 'randomEvent')) {
        dialogs.push({ kind: 'event' })
        sfx.play('event')
      }
      for (const event of events) {
        if (event.type === 'breakout') dialogs.push({ kind: 'breakout', productId: event.productId })
        if (event.type === 'stage') dialogs.push({ kind: 'stage', stage: event.stage })
        if (event.type === 'era') dialogs.push({ kind: 'era', era: event.era })
        if (event.type === 'breakout' || event.type === 'stage' || event.type === 'era') sfx.play('milestone')
      }
      const ready = events.filter((e) => e.type === 'projectReady')
      for (const event of ready) dialogs.push({ kind: 'ready', officeId: event.officeId })
      if (ready.length > 0) sfx.play('ready')
    }
    show(dialogs)
    return dialogs.length > 0
  }

  return {
    state,
    version,
    speed,
    dialog,
    toasts,
    selectedOffice,
    sfx,
    running,

    tick(dtMs) {
      if (!running()) return
      carryMs += Math.min(dtMs, MAX_FRAME_MS) * speed.value
      let advanced = false
      while (carryMs >= MS_PER_DAY) {
        carryMs -= MS_PER_DAY
        advanceDay(state)
        advanced = true
        if (handleEvents(drainEvents(state))) {
          carryMs = 0
          break
        }
      }
      if (advanced) bump()
    },

    setSpeed(next) {
      speed.value = next
    },

    openDialog(next) {
      dialog.value = next
    },

    closeDialog() {
      dialog.value = queue.shift() ?? null
    },

    selectOffice(officeId) {
      if (getOffice(state, officeId)) selectedOffice.value = officeId
    },

    startProject(productTypeId, featureIds, size, officeId) {
      const result = startProject(state, productTypeId, featureIds, size, officeFor(officeId))
      if (!result.ok) return result
      dialog.value = null
      if (speed.value === 0) speed.value = 1
      bump()
      sfx.play('click')
      return result
    },

    startUpdate(productId, featureIds, officeId) {
      const result = startUpdate(state, productId, featureIds, officeFor(officeId))
      if (!result.ok) return result
      dialog.value = null
      if (speed.value === 0) speed.value = 1
      bump()
      sfx.play('click')
      return result
    },

    startFix(productId, developerId, testerId) {
      const result = startFix(state, productId, developerId, testerId)
      if (!result.ok) return result
      if (speed.value === 0) speed.value = 1
      bump()
      sfx.play('click')
      return result
    },

    stopFix(fixId) {
      const result = stopFix(state, fixId)
      if (!result.ok) return result
      handleEvents(drainEvents(state))
      bump()
      sfx.play('click')
      return result
    },

    setOnCall(developerId, testerId) {
      return cue(changed(setOnCall(state, developerId, testerId)), 'click')
    },

    clearOnCall() {
      return cue(changed(clearOnCall(state)), 'click')
    },

    sunsetProduct(productId) {
      const result = sunsetProduct(state, productId)
      if (!result.ok) return result
      handleEvents(drainEvents(state))
      bump()
      sfx.play('click')
      return result
    },

    acceptContract(offerId, officeId) {
      const result = acceptContract(state, offerId, officeFor(officeId))
      if (!result.ok) return result
      dialog.value = null
      if (speed.value === 0) speed.value = 1
      bump()
      sfx.play('click')
      return result
    },

    abandonContract(officeId) {
      const result = abandonContract(state, officeFor(officeId))
      if (!result.ok) return result
      handleEvents(drainEvents(state))
      bump()
      sfx.play('bad')
      return result
    },

    promote(productId, tier) {
      return cue(changed(promoteProduct(state, productId, tier)), 'click')
    },

    shipProject(campaign, officeId) {
      const project = getOffice(state, officeFor(officeId))?.project ?? null
      const early = project !== null && !isReady(project)
      const reputationBefore = state.reputation
      const unlockedBefore = new Set(unlockedProductTypes(state).map((t) => t.id))
      const result = shipProject(state, campaign, officeFor(officeId))
      if (!result.ok) return result
      const unlocked = unlockedProductTypes(state)
        .filter((t) => !unlockedBefore.has(t.id))
        .map((t) => t.name)
      const events = drainEvents(state)
      for (const event of events) {
        if (event.type !== 'shipped') continue
        dialog.value = {
          kind: 'result',
          productId: event.productId,
          reputationDelta: state.reputation - reputationBefore,
          early,
          unlocked,
          update: event.update,
          reach: event.reach,
          bugs: event.bugs,
          quality: event.quality,
        }
      }
      handleEvents(events)
      bump()
      sfx.play('ship')
      return result
    },

    startResearch(id) {
      return cue(changed(startResearch(state, id)), 'click')
    },

    resolveEvent(index) {
      const result = resolveRandomEvent(state, index)
      if (!result.ok) return result
      handleEvents(drainEvents(state))
      dialog.value = queue.shift() ?? null
      bump()
      sfx.play('click')
      return result
    },

    hire(candidateId) {
      return cue(changed(hire(state, candidateId, selectedOffice.value)), 'hire')
    },

    promoteEmployee(employeeId) {
      const result = promote(state, employeeId)
      if (!result.ok) return result
      handleEvents(drainEvents(state))
      bump()
      sfx.play('milestone')
      return result
    },

    train(employeeId, discipline) {
      return cue(changed(startTraining(state, employeeId, discipline)), 'click')
    },

    teamOuting() {
      return cue(changed(teamOuting(state)), 'click')
    },

    fire(employeeId) {
      return changed(fire(state, employeeId))
    },

    moveOut() {
      return cue(changed(moveOut(state)), 'upgrade')
    },

    openOffice() {
      const result = openOffice(state)
      if (result.ok) selectedOffice.value = state.offices[state.offices.length - 1].id
      return cue(changed(result), 'upgrade')
    },

    transfer(employeeId, officeId) {
      return changed(transfer(state, employeeId, officeId))
    },

    acquire(rivalId) {
      const result = acquire(state, rivalId)
      if (!result.ok) return result
      handleEvents(drainEvents(state))
      bump()
      return result
    },
  }
}
