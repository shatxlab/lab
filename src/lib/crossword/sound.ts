/**
 * Tiny synthesised feedback for the crossword. Local-first means no audio
 * files: short Web Audio tones built on demand, failing soft everywhere.
 */

export type CrosswordSound = "tap" | "letter" | "word" | "error" | "win";

export interface CrosswordSoundEngine {
  play(name: CrosswordSound): void;
  setEnabled(enabled: boolean): void;
  resume(): void;
  isEnabled(): boolean;
}

interface ToneOptions {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  endFreq?: number;
}

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function tone(ctx: AudioContext, options: ToneOptions): void {
  const { freq, start, duration, type = "sine", gain = 0.12, endFreq } = options;
  const at = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freq), at);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), at + duration);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

/** Pure recipe mapping so the sound design stays unit-testable. */
export function crosswordRecipe(name: CrosswordSound): ToneOptions[] {
  switch (name) {
    case "tap":
      return [{ freq: 420, start: 0, duration: 0.05, type: "triangle", gain: 0.07 }];
    case "letter":
      return [{ freq: 620, start: 0, duration: 0.05, type: "sine", gain: 0.06 }];
    case "word":
      return [
        { freq: 659, start: 0, duration: 0.09, type: "sine", gain: 0.12 },
        { freq: 880, start: 0.07, duration: 0.12, type: "sine", gain: 0.12 },
      ];
    case "error":
      return [
        { freq: 300, start: 0, duration: 0.12, type: "square", gain: 0.08 },
        { freq: 220, start: 0.1, duration: 0.16, type: "square", gain: 0.08 },
      ];
    case "win":
      return [
        { freq: 523, start: 0, duration: 0.13, type: "triangle", gain: 0.18 },
        { freq: 659, start: 0.12, duration: 0.13, type: "triangle", gain: 0.18 },
        { freq: 784, start: 0.24, duration: 0.13, type: "triangle", gain: 0.18 },
        { freq: 1046, start: 0.36, duration: 0.32, type: "triangle", gain: 0.2 },
      ];
    default:
      return [];
  }
}

export function createCrosswordSoundEngine(initialEnabled = true): CrosswordSoundEngine {
  let enabled = initialEnabled;
  let ctx: AudioContext | null = null;

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  return {
    play(name) {
      if (!enabled) return;
      const context = ensure();
      if (!context) return;
      if (context.state === "suspended") void context.resume().catch(() => undefined);
      try {
        for (const options of crosswordRecipe(name)) tone(context, options);
      } catch {
        // Sound is a nicety; never break the board for it.
      }
    },
    setEnabled(next) {
      enabled = next;
    },
    resume() {
      const context = ensure();
      if (context?.state === "suspended") void context.resume().catch(() => undefined);
    },
    isEnabled() {
      return enabled;
    },
  };
}
