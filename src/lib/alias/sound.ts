/**
 * Tiny synthesised sound effects. Alias is local-first, so instead of shipping
 * audio files we build short tones with the Web Audio API on demand. The
 * AudioContext is created lazily (browsers require a user gesture) and every
 * hook fails soft so a locked-down browser never breaks the game.
 */

export type SoundName =
  | "select"
  | "start"
  | "correct"
  | "skip"
  | "tick"
  | "urgent"
  | "timeUp"
  | "win";

export interface SoundEngine {
  play(name: SoundName): void;
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
  const { freq, start, duration, type = "sine", gain = 0.18, endFreq } = options;
  const at = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freq), at);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), at + duration);
  }
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

/** Pure function mapping a sound name to its tone recipe (keeps it testable). */
export function soundRecipe(name: SoundName): ToneOptions[] {
  switch (name) {
    case "select":
      return [{ freq: 520, start: 0, duration: 0.09, type: "triangle", gain: 0.12 }];
    case "start":
      return [
        { freq: 440, start: 0, duration: 0.14, type: "triangle" },
        { freq: 554, start: 0.1, duration: 0.14, type: "triangle" },
        { freq: 659, start: 0.2, duration: 0.2, type: "triangle" },
      ];
    case "correct":
      return [
        { freq: 659, start: 0, duration: 0.1, type: "sine", gain: 0.2 },
        { freq: 988, start: 0.08, duration: 0.16, type: "sine", gain: 0.2 },
      ];
    case "skip":
      return [
        { freq: 340, start: 0, duration: 0.36, type: "sawtooth", gain: 0.12, endFreq: 150 },
        { freq: 250, start: 0.18, duration: 0.34, type: "square", gain: 0.07, endFreq: 120 },
      ];
    case "tick":
      return [{ freq: 880, start: 0, duration: 0.05, type: "square", gain: 0.07 }];
    case "urgent":
      return [{ freq: 1040, start: 0, duration: 0.09, type: "square", gain: 0.1 }];
    case "timeUp":
      return [
        { freq: 440, start: 0, duration: 0.16, type: "sawtooth", gain: 0.16 },
        { freq: 349, start: 0.15, duration: 0.16, type: "sawtooth", gain: 0.16 },
        { freq: 262, start: 0.3, duration: 0.28, type: "sawtooth", gain: 0.16 },
      ];
    case "win":
      return [
        { freq: 523, start: 0, duration: 0.14, type: "triangle", gain: 0.2 },
        { freq: 659, start: 0.13, duration: 0.14, type: "triangle", gain: 0.2 },
        { freq: 784, start: 0.26, duration: 0.14, type: "triangle", gain: 0.2 },
        { freq: 1046, start: 0.39, duration: 0.34, type: "triangle", gain: 0.22 },
      ];
    default:
      return [];
  }
}

export function createSoundEngine(initialEnabled = true): SoundEngine {
  let enabled = initialEnabled;
  let ctx: AudioContext | null = null;

  const ensureContext = (): AudioContext | null => {
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
    play(name: SoundName) {
      if (!enabled) return;
      const context = ensureContext();
      if (!context) return;
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
      }
      try {
        for (const options of soundRecipe(name)) tone(context, options);
      } catch {
        // Audio is a nicety; never let it break a round.
      }
    },
    setEnabled(next: boolean) {
      enabled = next;
    },
    resume() {
      const context = ensureContext();
      if (context?.state === "suspended") {
        void context.resume().catch(() => undefined);
      }
    },
    isEnabled() {
      return enabled;
    },
  };
}
