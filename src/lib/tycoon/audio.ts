import { signal, type Signal } from './signals'
import type { KeyValueStorage } from '@/lib/tycoon/save'

export type Sfx = 'click' | 'hire' | 'upgrade' | 'ready' | 'ship' | 'event' | 'milestone' | 'research' | 'bad' | 'hit' | 'era' | 'deal'

interface Note {
  /** Pitch in Hz. */
  freq: number
  /** Seconds after the sound starts. */
  at: number
  /** How long it rings, in seconds. */
  dur: number
  type?: 'sine' | 'square' | 'triangle' | 'sawtooth'
  /** Loudness relative to the other notes, 0-1. */
  gain?: number
}

/** Every sound is a few synthesized notes, so there are no audio files to load. */
export const SOUNDS: Record<Sfx, readonly Note[]> = {
  click: [{ freq: 880, at: 0, dur: 0.05, type: 'square', gain: 0.35 }],
  hire: [
    { freq: 523, at: 0, dur: 0.1, type: 'triangle' },
    { freq: 784, at: 0.09, dur: 0.18, type: 'triangle' },
  ],
  upgrade: [
    { freq: 392, at: 0, dur: 0.12, type: 'triangle' },
    { freq: 523, at: 0.1, dur: 0.12, type: 'triangle' },
    { freq: 659, at: 0.2, dur: 0.12, type: 'triangle' },
    { freq: 784, at: 0.3, dur: 0.3, type: 'triangle' },
  ],
  ready: [
    { freq: 660, at: 0, dur: 0.12, type: 'triangle' },
    { freq: 880, at: 0.12, dur: 0.22, type: 'triangle' },
  ],
  ship: [
    { freq: 523, at: 0, dur: 0.12 },
    { freq: 659, at: 0.08, dur: 0.12 },
    { freq: 784, at: 0.16, dur: 0.12 },
    { freq: 1047, at: 0.24, dur: 0.4 },
  ],
  event: [
    { freq: 740, at: 0, dur: 0.1, type: 'square', gain: 0.5 },
    { freq: 740, at: 0.16, dur: 0.1, type: 'square', gain: 0.5 },
  ],
  milestone: [
    { freq: 523, at: 0, dur: 0.1, type: 'triangle' },
    { freq: 659, at: 0.09, dur: 0.1, type: 'triangle' },
    { freq: 784, at: 0.18, dur: 0.1, type: 'triangle' },
    { freq: 1047, at: 0.27, dur: 0.1, type: 'triangle' },
    { freq: 1319, at: 0.36, dur: 0.4, type: 'triangle' },
  ],
  research: [
    { freq: 880, at: 0, dur: 0.08, type: 'triangle' },
    { freq: 1175, at: 0.09, dur: 0.24, type: 'triangle' },
  ],
  bad: [
    { freq: 196, at: 0, dur: 0.25, type: 'sawtooth', gain: 0.6 },
    { freq: 147, at: 0.22, dur: 0.45, type: 'sawtooth', gain: 0.6 },
  ],
  // A breakout hit: a quick run up and a long bright chord on top.
  hit: [
    { freq: 392, at: 0, dur: 0.08, type: 'triangle' },
    { freq: 523, at: 0.07, dur: 0.08, type: 'triangle' },
    { freq: 659, at: 0.14, dur: 0.08, type: 'triangle' },
    { freq: 784, at: 0.21, dur: 0.08, type: 'triangle' },
    { freq: 1047, at: 0.28, dur: 0.5, type: 'triangle' },
    { freq: 1319, at: 0.28, dur: 0.5, type: 'sine', gain: 0.6 },
    { freq: 1568, at: 0.28, dur: 0.5, type: 'sine', gain: 0.45 },
  ],
  // A new era: two slow, low notes, like a change of weather.
  era: [
    { freq: 262, at: 0, dur: 0.35, type: 'sine' },
    { freq: 392, at: 0.3, dur: 0.6, type: 'sine' },
  ],
  // Money changing hands: a bright two-note chime.
  deal: [
    { freq: 1175, at: 0, dur: 0.08, type: 'square', gain: 0.4 },
    { freq: 1568, at: 0.08, dur: 0.3, type: 'square', gain: 0.4 },
  ],
}

// The smallest part of the Web Audio API we use, so tests can stand in a fake.
interface ParamLike {
  value: number
  setValueAtTime(value: number, time: number): unknown
  linearRampToValueAtTime(value: number, time: number): unknown
  exponentialRampToValueAtTime(value: number, time: number): unknown
}
interface NodeLike {
  connect(destination: unknown): unknown
  disconnect(): void
}
interface OscillatorLike extends NodeLike {
  type: string
  frequency: ParamLike
  onended: ((...args: never[]) => unknown) | null
  start(time: number): void
  stop(time: number): void
}
interface GainLike extends NodeLike {
  gain: ParamLike
}
export interface AudioContextLike {
  readonly currentTime: number
  readonly state: string
  readonly destination: unknown
  createOscillator(): OscillatorLike
  createGain(): GainLike
  resume(): Promise<void>
}

export const MUTE_KEY = 'lab:tycoon:muted'
/** Everything is quiet and short: a game people play in a corner of the office. */
const MASTER_GAIN = 0.12
const FLOOR = 0.0001
const ATTACK = 0.01

export interface SfxPlayer {
  /** True while sound is switched off. */
  readonly muted: Signal<boolean>
  setMuted(muted: boolean): void
  /** Call from a user gesture: browsers only allow sound after one. Safe to call repeatedly. */
  unlock(): void
  play(sound: Sfx): void
}

interface SfxOptions {
  /** Where the mute choice is kept; null to keep nothing. */
  storage: KeyValueStorage | null
  /** Makes the audio context; may return null or throw where there is none. */
  create: () => AudioContextLike | null
}

export function createSfx({ storage, create }: SfxOptions): SfxPlayer {
  let saved = false
  try {
    saved = storage?.getItem(MUTE_KEY) === '1'
  } catch {
    // Treat unreadable storage as "not muted".
  }
  const muted = signal(saved)

  let unlocked = false
  let context: AudioContextLike | null = null
  let master: GainLike | null = null

  const ensure = (): AudioContextLike | null => {
    if (!unlocked) return null
    if (context) return context
    try {
      context = create()
    } catch {
      context = null
    }
    if (!context) return null
    master = context.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(context.destination)
    return context
  }

  const note = (ctx: AudioContextLike, n: Note, origin: number) => {
    const oscillator = ctx.createOscillator()
    const envelope = ctx.createGain()
    const start = origin + n.at
    const end = start + n.dur
    oscillator.type = n.type ?? 'sine'
    oscillator.frequency.setValueAtTime(n.freq, start)
    envelope.gain.setValueAtTime(FLOOR, start)
    envelope.gain.linearRampToValueAtTime(n.gain ?? 1, start + ATTACK)
    envelope.gain.exponentialRampToValueAtTime(FLOOR, end)
    oscillator.connect(envelope)
    envelope.connect(master)
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(end + 0.02)
  }

  return {
    muted,

    setMuted(value) {
      muted.value = value
      try {
        storage?.setItem(MUTE_KEY, value ? '1' : '0')
      } catch {
        // The choice just won't outlast this session.
      }
    },

    unlock() {
      unlocked = true
      const ctx = ensure()
      if (ctx?.state === 'suspended') void ctx.resume().catch(() => {})
    },

    play(sound) {
      if (muted.value) return
      const ctx = ensure()
      if (!ctx) return
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      for (const n of SOUNDS[sound]) note(ctx, n, ctx.currentTime)
    },
  }
}

/** A player that never makes a sound; the default for tests and for hosts without audio. */
export function silentSfx(): SfxPlayer {
  return createSfx({ storage: null, create: () => null })
}
