/** Soft synthesised feedback for Wordle; no audio files, fails silent. */

export type WordleSound = "key" | "delete" | "reveal" | "error" | "win" | "lose";

export interface WordleSoundEngine {
  play(name: WordleSound): void;
  setEnabled(enabled: boolean): void;
  resume(): void;
}

interface Tone {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

export function wordleRecipe(name: WordleSound): Tone[] {
  switch (name) {
    case "key":
      return [{ freq: 520, start: 0, duration: 0.04, type: "triangle", gain: 0.05 }];
    case "delete":
      return [{ freq: 330, start: 0, duration: 0.05, type: "triangle", gain: 0.05 }];
    case "reveal":
      return [0, 1, 2, 3, 4].map((step) => ({ freq: 440 + step * 55, start: step * 0.18, duration: 0.1, type: "sine" as const, gain: 0.07 }));
    case "error":
      return [
        { freq: 200, start: 0, duration: 0.09, type: "square", gain: 0.05 },
        { freq: 170, start: 0.1, duration: 0.12, type: "square", gain: 0.05 },
      ];
    case "win":
      return [523, 659, 784, 1047].map((freq, step) => ({ freq, start: 0.9 + step * 0.11, duration: 0.18, type: "sine" as const, gain: 0.1 }));
    case "lose":
      return [
        { freq: 392, start: 0.9, duration: 0.2, type: "sine", gain: 0.09 },
        { freq: 294, start: 1.1, duration: 0.3, type: "sine", gain: 0.09 },
      ];
  }
}

type Ctor = typeof AudioContext;

export function createWordleSoundEngine(enabled = true): WordleSoundEngine {
  let on = enabled;
  let context: AudioContext | null = null;

  const ensure = (): AudioContext | null => {
    if (context) return context;
    if (typeof window === "undefined") return null;
    const scope = window as typeof window & { webkitAudioContext?: Ctor };
    const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      context = null;
    }
    return context;
  };

  return {
    setEnabled(value) {
      on = value;
    },
    resume() {
      void ensure()?.resume?.();
    },
    play(name) {
      if (!on) return;
      const ctx = ensure();
      if (!ctx) return;
      try {
        for (const { freq, start, duration, type = "sine", gain = 0.08 } of wordleRecipe(name)) {
          const at = ctx.currentTime + start;
          const osc = ctx.createOscillator();
          const amp = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, at);
          amp.gain.setValueAtTime(0.0001, at);
          amp.gain.linearRampToValueAtTime(gain, at + 0.01);
          amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
          osc.connect(amp);
          amp.connect(ctx.destination);
          osc.start(at);
          osc.stop(at + duration + 0.03);
        }
      } catch {
        // Sound is decoration.
      }
    },
  };
}
