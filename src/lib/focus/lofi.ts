/**
 * The music for the Focus office: an endless, gentle lo-fi loop made on the fly,
 * so there is nothing to download, nothing to license and nothing that needs a
 * network. This file is the *score*: for a given bar number it says which notes
 * and drum hits happen, deterministically from a seed. `lofi-audio.ts` plays it.
 *
 * Four-bar phrases follow one of a few jazzy chord loops in C; the pad plays
 * seventh and ninth chords, the bass holds the root, the drums keep a slow
 * swung boom-bap, and a sparse pentatonic lead drifts over the top.
 */

import { seededRandom } from "@/lib/focus/random";

export const BPM = 74;
export const BEAT = 60 / BPM;
export const BEATS_PER_BAR = 4;
export const BAR = BEAT * BEATS_PER_BAR;
/** How far the second eighth note of a pair is pushed late (0 is straight, 1/3 is a full triplet). */
export const SWING = 0.17;

export type Voice = "keys" | "bass" | "kick" | "snare" | "hat" | "lead";

export interface NoteEvent {
  voice: Voice;
  /** Seconds from the start of the bar. */
  at: number;
  /** Seconds the note is held (drums ignore it). */
  duration: number;
  /** 0–1. */
  velocity: number;
  /** MIDI note number; absent for drums. */
  midi?: number;
}

interface Chord {
  bass: number;
  notes: readonly number[];
}

const Dm9: Chord = { bass: 38, notes: [53, 57, 60, 64] };
const G13: Chord = { bass: 43, notes: [53, 59, 62, 64] };
const Cmaj9: Chord = { bass: 36, notes: [55, 59, 62, 64] };
const Cmaj7: Chord = { bass: 36, notes: [52, 55, 59, 64] };
const Am7: Chord = { bass: 45, notes: [55, 60, 64, 67] };
const Dm7: Chord = { bass: 38, notes: [53, 57, 60, 64] };
const G7: Chord = { bass: 43, notes: [53, 59, 62, 65] };
const Fmaj7: Chord = { bass: 41, notes: [52, 57, 60, 64] };
const Em7: Chord = { bass: 40, notes: [55, 59, 62, 67] };
const G69: Chord = { bass: 43, notes: [57, 59, 62, 64] };

export const PROGRESSIONS: readonly (readonly Chord[])[] = [
  [Dm9, G13, Cmaj9, Am7],
  [Cmaj7, Am7, Dm7, G7],
  [Fmaj7, Em7, Dm7, Cmaj7],
  [Am7, Fmaj7, Cmaj9, G69],
];

/** C major pentatonic, a fifth above the keys: nothing in it can clash with the chords. */
export const LEAD_NOTES: readonly number[] = [72, 74, 76, 79, 81, 84];

/** The chord loop that plays during phrase `phrase` (every four bars). */
export function progressionFor(phrase: number, seed: number): readonly Chord[] {
  const pick = seededRandom(seed ^ Math.imul(phrase + 1, 0x9e3779b1))();
  return PROGRESSIONS[Math.floor(pick * PROGRESSIONS.length)]!;
}

const KEYS_PATTERNS: readonly (readonly [beat: number, length: number][])[] = [
  [[0, 2], [2.5, 1.4]],
  [[0, 1.4], [1.5, 1.2], [3, 0.9]],
  [[0, 2.5], [2.75, 1.1]],
];

/** Everything that sounds in bar number `index` (counting from 0), sorted by time. */
export function planBar(index: number, seed: number): NoteEvent[] {
  const next = seededRandom(seed ^ Math.imul(index + 7, 0x85ebca6b));
  const chord = progressionFor(Math.floor(index / 4), seed)[index % 4]!;
  const events: NoteEvent[] = [];
  const beat = (n: number) => n * BEAT;
  // A little human looseness, never more than a hundredth of a second.
  const loose = () => (next() - 0.5) * 0.016;
  const add = (event: NoteEvent) => events.push({ ...event, at: Math.max(0, event.at + loose()) });

  // Chords: a soft strum, one of a few comping patterns.
  const pattern = KEYS_PATTERNS[Math.floor(next() * KEYS_PATTERNS.length)]!;
  pattern.forEach(([at, length], hit) => {
    const velocity = (hit === 0 ? 0.62 : 0.46) + next() * 0.1;
    chord.notes.forEach((midi, i) => add({ voice: "keys", at: beat(at) + i * 0.014, duration: beat(length), velocity, midi }));
  });

  // Bass: the root on the downbeat, and again late in the bar, sometimes a fifth up.
  add({ voice: "bass", at: 0, duration: beat(1.6), velocity: 0.7, midi: chord.bass });
  if (next() < 0.85) add({ voice: "bass", at: beat(2.5), duration: beat(1.2), velocity: 0.55, midi: chord.bass + (next() < 0.3 ? 7 : 0) });

  // Drums: kick on one and the "and" of three, snare on two and four, swung hats.
  add({ voice: "kick", at: 0, duration: 0.2, velocity: 0.85 });
  if (next() < 0.4) add({ voice: "kick", at: beat(1.5), duration: 0.2, velocity: 0.5 });
  add({ voice: "kick", at: beat(2.5), duration: 0.2, velocity: 0.75 });
  add({ voice: "snare", at: beat(1), duration: 0.15, velocity: 0.55 + next() * 0.1 });
  add({ voice: "snare", at: beat(3), duration: 0.15, velocity: 0.55 + next() * 0.1 });
  for (let eighth = 0; eighth < 8; eighth += 1) {
    if (next() < 0.1) continue;
    const swung = eighth % 2 === 1 ? SWING : 0;
    add({ voice: "hat", at: beat(eighth * 0.5 + swung), duration: 0.05, velocity: (eighth % 2 === 0 ? 0.4 : 0.22) + next() * 0.12 });
  }

  // Lead: a short pentatonic figure in most bars, silence in some.
  if (next() < 0.7) {
    let at = [0.5, 1, 1.5, 2.5][Math.floor(next() * 4)]!;
    let step = Math.floor(next() * LEAD_NOTES.length);
    const notes = 1 + Math.floor(next() * 3);
    for (let n = 0; n < notes && at < 3.75; n += 1) {
      const length = [0.5, 1, 1.5][Math.floor(next() * 3)]!;
      add({ voice: "lead", at: beat(at), duration: beat(length), velocity: 0.3 + next() * 0.15, midi: LEAD_NOTES[step]! });
      at += length;
      step = Math.max(0, Math.min(LEAD_NOTES.length - 1, step + (next() < 0.5 ? -1 : 1) * (1 + Math.floor(next() * 2))));
    }
  }

  return events.sort((a, b) => a.at - b.at);
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
