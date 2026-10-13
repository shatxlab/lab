/**
 * The music for the Focus office: an endless lo-fi track written on the fly, so
 * there is nothing to download, nothing to license and nothing that needs a
 * network. This file is the *score*: for a given bar number it says which notes
 * and drum hits happen, deterministically from a seed. `lofi-audio.ts` plays it.
 *
 * It is laid out like a song rather than a loop. Chords come from a few warm
 * progressions in F, each held for eight bars, and the track moves through
 * sections (a quiet intro, grooves, melodic passages and a drumless "breath")
 * so it rises and falls instead of droning. The melody is a short motif written
 * once per eight bars and repeated with an answer, so it sounds composed rather
 * than random, and it lands on the chord's own notes.
 */

import { seededRandom } from "@/lib/focus/random";

export const BPM = 70;
export const BEAT = 60 / BPM;
export const BEATS_PER_BAR = 4;
export const BAR = BEAT * BEATS_PER_BAR;
/** Beats the off-beat eighth notes are pushed late (0 is straight, 1/6 is a full triplet). */
export const SWING = 0.11;

export type Voice = "keys" | "pad" | "bass" | "kick" | "snare" | "hat" | "lead";

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

export interface Chord {
  bass: number;
  notes: readonly number[];
}

// Voiced close together so that moving from one chord to the next shifts only a note or two.
const Gm9: Chord = { bass: 43, notes: [58, 62, 65, 69] };
const C13: Chord = { bass: 36, notes: [58, 62, 64, 69] };
const C9sus: Chord = { bass: 36, notes: [58, 62, 65, 67] };
const Fmaj9: Chord = { bass: 41, notes: [57, 60, 64, 67] };
const Dm9: Chord = { bass: 38, notes: [57, 60, 64, 65] };
const Bbmaj9: Chord = { bass: 46, notes: [57, 60, 62, 65] };
const Am7: Chord = { bass: 45, notes: [55, 60, 64, 69] };
const Ebmaj9: Chord = { bass: 39, notes: [55, 58, 62, 65] };

export const PROGRESSIONS: readonly (readonly Chord[])[] = [
  [Gm9, C13, Fmaj9, Dm9],
  [Bbmaj9, Am7, Gm9, C9sus],
  [Fmaj9, Ebmaj9, Dm9, C9sus],
  [Dm9, Bbmaj9, Fmaj9, C13],
];

/** F major pentatonic, just above the keys: kept low so the melody stays mellow. */
export const LEAD_NOTES: readonly number[] = [67, 69, 72, 74, 77, 79];

export type Section = "intro" | "groove" | "melody" | "breath";

/** The song after the intro, one entry per four-bar phrase, then round again. */
const FORM: readonly Section[] = ["groove", "melody", "melody", "groove", "breath", "melody", "melody", "groove"];

export function sectionFor(phrase: number): Section {
  return phrase === 0 ? "intro" : FORM[(phrase - 1) % FORM.length]!;
}

/** Eight bars (two phrases) share a progression and a melody. */
const blockOf = (phrase: number) => Math.floor(phrase / 2);

/** The chord loop that plays during phrase `phrase`: a new one every eight bars, never the same twice running. */
export function progressionFor(phrase: number, seed: number): readonly Chord[] {
  const count = PROGRESSIONS.length;
  let index = 0;
  for (let block = 0; block <= blockOf(phrase); block += 1) {
    const pick = seededRandom(seed ^ Math.imul(block + 1, 0x9e3779b1))();
    index = block === 0 ? Math.floor(pick * count) : (index + 1 + Math.floor(pick * (count - 1))) % count;
  }
  return PROGRESSIONS[index]!;
}

export function chordAt(index: number, seed: number): Chord {
  return progressionFor(Math.floor(index / 4), seed)[index % 4]!;
}

type Rhythm = readonly (readonly [beat: number, length: number])[];

/** One-bar melodic rhythms; a motif picks one and keeps it for eight bars. */
const MOTIF_RHYTHMS: readonly Rhythm[] = [
  [[0.5, 0.5], [1, 0.5], [1.5, 1.5], [3, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 1.5]],
  [[0.5, 1], [1.5, 1], [2.5, 0.5], [3, 1]],
  [[0, 0.75], [0.75, 0.75], [1.5, 2.5]],
];
const ANSWER: Rhythm = [[0.5, 1], [1.5, 2.5]];
const MOTIF_STEPS = [-2, -1, -1, 0, 1, 1, 2];

interface Motif {
  rhythm: Rhythm;
  steps: readonly number[];
  /** Where in LEAD_NOTES it starts. */
  anchor: number;
}

function motifFor(block: number, seed: number): Motif {
  const next = seededRandom(seed ^ Math.imul(block + 3, 0xc2b2ae35));
  const rhythm = MOTIF_RHYTHMS[Math.floor(next() * MOTIF_RHYTHMS.length)]!;
  const steps = rhythm.map(() => MOTIF_STEPS[Math.floor(next() * MOTIF_STEPS.length)]!);
  return { rhythm, steps, anchor: 1 + Math.floor(next() * 3) };
}

const KEYS_PATTERNS: readonly Rhythm[] = [
  [[0, 2], [2.5, 1.4]],
  [[0, 1.4], [1.5, 1.2], [3, 0.9]],
  [[0, 2.5], [2.75, 1.1]],
  [[0, 3.4], [3.5, 0.5]],
];
/** The order the chord's notes are picked in during the drumless sections. */
const ARPEGGIO = [0, 1, 2, 3, 1, 2, 3, 2];

const swing = (at: number) => (Number.isInteger(at * 2) && !Number.isInteger(at) ? at + SWING : at);
const clampStep = (step: number) => Math.max(0, Math.min(LEAD_NOTES.length - 1, step));

/** Everything that sounds in bar number `index` (counting from 0), sorted by time. */
export function planBar(index: number, seed: number): NoteEvent[] {
  const next = seededRandom(seed ^ Math.imul(index + 7, 0x85ebca6b));
  const phrase = Math.floor(index / 4);
  const inPhrase = index % 4;
  const section = sectionFor(phrase);
  const chord = chordAt(index, seed);
  const events: NoteEvent[] = [];
  const beat = (n: number) => n * BEAT;
  // A little human looseness, never more than a hundredth of a second.
  const loose = () => (next() - 0.5) * 0.016;
  const add = (event: NoteEvent) => events.push({ ...event, at: Math.min(BAR - 0.01, Math.max(0, event.at + loose())) });
  const drums = section === "groove" || section === "melody";

  // Pad: the whole chord, held, underneath everything.
  for (const midi of chord.notes) add({ voice: "pad", at: 0, duration: BAR, velocity: drums ? 0.45 : 0.6, midi });

  // Keys: comping when the drums play, a slow arpeggio when they do not.
  if (drums) {
    const pattern = KEYS_PATTERNS[Math.floor(next() * KEYS_PATTERNS.length)]!;
    const soften = section === "melody" ? 0.85 : 1;
    pattern.forEach(([at, length], hit) => {
      const velocity = ((hit === 0 ? 0.6 : 0.45) + next() * 0.1) * soften;
      chord.notes.forEach((midi, i) => add({ voice: "keys", at: beat(swing(at)) + i * 0.016, duration: beat(length), velocity, midi }));
    });
  } else {
    ARPEGGIO.forEach((note, eighth) => {
      add({ voice: "keys", at: beat(swing(eighth * 0.5)), duration: beat(1.5), velocity: (eighth % 2 === 0 ? 0.42 : 0.32) + next() * 0.06, midi: chord.notes[note]! });
    });
  }

  // Bass: silent for the first half of the intro, long notes in the breath, walking a little in the groove.
  if (section === "breath" || (section === "intro" && inPhrase >= 2)) {
    add({ voice: "bass", at: 0, duration: beat(3.8), velocity: 0.55, midi: chord.bass });
  } else if (drums) {
    add({ voice: "bass", at: 0, duration: beat(1.5), velocity: 0.7, midi: chord.bass });
    const following = chordAt(index + 1, seed).bass;
    const approach = following !== chord.bass && next() < 0.5;
    if (next() < 0.85) add({ voice: "bass", at: beat(swing(2.5)), duration: beat(approach ? 0.9 : 1.2), velocity: 0.55, midi: chord.bass + (next() < 0.3 ? 7 : 0) });
    // A step into the next chord's root, from a semitone above or below.
    if (approach) add({ voice: "bass", at: beat(swing(3.5)), duration: beat(0.5), velocity: 0.45, midi: following + (next() < 0.5 ? 1 : -1) });
  }

  // Drums: a soft, swung boom-bap with brushed snares, only in the groove and melody.
  if (drums) {
    add({ voice: "kick", at: 0, duration: 0.2, velocity: 0.8 });
    if (next() < 0.35) add({ voice: "kick", at: beat(swing(1.5)), duration: 0.2, velocity: 0.45 });
    add({ voice: "kick", at: beat(swing(2.5)), duration: 0.2, velocity: 0.7 });
    add({ voice: "snare", at: beat(1), duration: 0.2, velocity: 0.5 + next() * 0.1 });
    add({ voice: "snare", at: beat(3), duration: 0.2, velocity: 0.5 + next() * 0.1 });
    if (next() < 0.2) add({ voice: "snare", at: beat(3.75), duration: 0.1, velocity: 0.18 });
    for (let eighth = 0; eighth < 8; eighth += 1) {
      if (eighth > 0 && next() < 0.12) continue;
      add({ voice: "hat", at: beat(swing(eighth * 0.5)), duration: 0.05, velocity: (eighth % 2 === 0 ? 0.34 : 0.2) + next() * 0.1 });
    }
  }

  // Lead: the motif, its answer, the motif again a step away, then a long note or a rest.
  const pcs = new Set([chord.bass, ...chord.notes].map((n) => n % 12));
  const toChordTone = (step: number) => {
    for (const distance of [0, 1, -1, 2, -2]) {
      const candidate = clampStep(step + distance);
      if (pcs.has(LEAD_NOTES[candidate]! % 12)) return candidate;
    }
    return clampStep(step);
  };
  const figure = (rhythm: Rhythm, start: number, steps: readonly number[], velocity: number) => {
    let step = clampStep(start);
    rhythm.forEach(([at, length], i) => {
      const landing = i === 0 || i === rhythm.length - 1 ? toChordTone(step) : step;
      add({ voice: "lead", at: beat(swing(at)), duration: beat(length) * 0.95, velocity: velocity + next() * 0.06, midi: LEAD_NOTES[landing]! });
      step = clampStep(landing + (steps[i] ?? 0));
    });
  };
  const motif = motifFor(blockOf(phrase), seed);
  if (section === "melody") {
    const lift = phrase % 2 === 0 ? 1 : -1;
    if (inPhrase === 0) figure(motif.rhythm, motif.anchor, motif.steps, 0.36);
    else if (inPhrase === 1) figure(ANSWER, motif.anchor - 1, [1], 0.32);
    else if (inPhrase === 2) figure(motif.rhythm, motif.anchor + lift, motif.steps, 0.38);
    else if (next() < 0.6) figure([[0, 3]], motif.anchor, [], 0.3);
  } else if (section === "groove" && inPhrase === 3 && next() < 0.5) {
    figure(ANSWER, motif.anchor, [-1], 0.28);
  }

  return events.sort((a, b) => a.at - b.at);
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
