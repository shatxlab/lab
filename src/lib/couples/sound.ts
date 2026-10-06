/**
 * Synthesised feedback, following the same local-first pattern as the other
 * lab tools: short Web Audio tones built on demand, failing soft everywhere.
 */

export type CouplesSound = "tap" | "pass" | "match" | "miss" | "finish";

export interface CouplesSoundEngine {
  play(name: CouplesSound): void;
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
export function couplesRecipe(name: CouplesSound): ToneOptions[] {
  switch (name) {
    case "tap":
      return [{ freq: 440, start: 0, duration: 0.05, type: "triangle", gain: 0.07 }];
    case "pass":
      return [
        { freq: 520, start: 0, duration: 0.07, type: "sine", gain: 0.08 },
        { freq: 700, start: 0.06, duration: 0.09, type: "sine", gain: 0.08 },
      ];
    case "match":
      return [
        { freq: 659, start: 0, duration: 0.1, type: "triangle", gain: 0.16 },
        { freq: 880, start: 0.09, duration: 0.14, type: "triangle", gain: 0.16 },
        { freq: 1046, start: 0.18, duration: 0.2, type: "triangle", gain: 0.14 },
      ];
    case "miss":
      return [
        { freq: 320, start: 0, duration: 0.12, type: "square", gain: 0.07 },
        { freq: 240, start: 0.1, duration: 0.16, type: "square", gain: 0.07 },
      ];
    case "finish":
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

export function createCouplesSoundEngine(initialEnabled = true): CouplesSoundEngine {
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
        for (const options of couplesRecipe(name)) tone(context, options);
      } catch {
        // Sound is a nicety; never break the game for it.
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
