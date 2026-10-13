/** Soft synthesised feedback for the card flow; no audio files, fails silent. */

export type FlashSound = "flip" | "good" | "again" | "done";

export interface FlashSoundEngine {
  play(name: FlashSound): void;
  setEnabled(enabled: boolean): void;
}

interface Tone {
  freq: number;
  start: number;
  duration: number;
  gain: number;
}

export function flashRecipe(name: FlashSound): Tone[] {
  switch (name) {
    case "flip":
      return [{ freq: 480, start: 0, duration: 0.05, gain: 0.04 }];
    case "good":
      return [{ freq: 660, start: 0, duration: 0.08, gain: 0.06 }];
    case "again":
      return [{ freq: 260, start: 0, duration: 0.12, gain: 0.06 }];
    case "done":
      return [523, 659, 784].map((freq, step) => ({ freq, start: step * 0.1, duration: 0.16, gain: 0.08 }));
  }
}

export function createFlashSoundEngine(initiallyOn: boolean): FlashSoundEngine {
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
        for (const { freq, start, duration, gain } of flashRecipe(name)) {
          const at = audio.currentTime + start;
          const osc = audio.createOscillator();
          const amp = audio.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, at);
          amp.gain.setValueAtTime(0.0001, at);
          amp.gain.linearRampToValueAtTime(gain, at + 0.01);
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
