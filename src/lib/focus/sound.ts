/** Synthesised cues for the Focus office; no audio files, fails silent. */

export type FocusSound = "start" | "chime" | "breakEnd" | "walkout" | "emptyOffice";

export interface FocusSoundEngine {
  play(name: FocusSound): void;
  setEnabled(enabled: boolean): void;
}

interface Tone {
  freq: number;
  start: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}

export function focusRecipe(name: FocusSound): Tone[] {
  switch (name) {
    case "start":
      return [440, 587].map((freq, step) => ({ freq, start: step * 0.1, duration: 0.14, gain: 0.07 }));
    case "chime":
      // A bell that rings twice, so a break cannot start unnoticed.
      return [0, 0.9].flatMap((offset) => [523, 659, 784, 1047].map((freq, step) => ({ freq, start: offset + step * 0.14, duration: 0.7, gain: 0.2 })));
    case "breakEnd":
      // Back to work: a firm falling-and-rising call, as loud as the bell.
      return [0, 0.5].flatMap((offset) => [784, 587, 784].map((freq, step) => ({ freq, start: offset + step * 0.12, duration: 0.3, gain: 0.18, type: "triangle" as const })));
    case "walkout":
      return [
        { freq: 150, start: 0, duration: 0.18, gain: 0.1, type: "triangle" },
        { freq: 110, start: 0.22, duration: 0.3, gain: 0.1, type: "triangle" },
      ];
    case "emptyOffice":
      return [392, 330, 262].map((freq, step) => ({ freq, start: step * 0.3, duration: 0.5, gain: 0.09 }));
  }
}

export function createFocusSoundEngine(initiallyOn: boolean): FocusSoundEngine {
  let on = initiallyOn;
  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = Ctor ? new Ctor() : null;
    } catch {
      ctx = null;
    }
    return ctx;
  };

  return {
    setEnabled(value) {
      on = value;
    },
    play(name) {
      if (!on) return;
      const audio = ensure();
      if (!audio) return;
      try {
        void audio.resume?.();
        for (const { freq, start, duration, gain, type = "sine" } of focusRecipe(name)) {
          const at = audio.currentTime + start;
          const osc = audio.createOscillator();
          const amp = audio.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, at);
          amp.gain.setValueAtTime(0.0001, at);
          amp.gain.linearRampToValueAtTime(gain, at + 0.015);
          amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
          osc.connect(amp);
          amp.connect(audio.destination);
          osc.start(at);
          osc.stop(at + duration + 0.03);
        }
      } catch {
        // Sound is decoration.
      }
    },
  };
}
