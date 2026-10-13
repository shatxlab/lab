import { describe, expect, it } from "vitest";

import { BAR, BEAT, BPM, LEAD_NOTES, PROGRESSIONS, SWING, chordAt, midiToHz, planBar, progressionFor, sectionFor } from "@/lib/focus/lofi";

const SEED = 42;
const bar = (index: number, seed = SEED) => planBar(index, seed);
const voice = (events: ReturnType<typeof planBar>, name: string) => events.filter((e) => e.voice === name);
const withDrums = (index: number) => ["groove", "melody"].includes(sectionFor(Math.floor(index / 4)));

describe("the lo-fi score", () => {
  it("is slow and lazy", () => {
    expect(BPM).toBeGreaterThanOrEqual(65);
    expect(BPM).toBeLessThanOrEqual(85);
    expect(BAR).toBeCloseTo(BEAT * 4, 9);
  });

  it("is the same every time for the same seed and bar, and different for another seed", () => {
    expect(bar(5)).toEqual(bar(5));
    expect(bar(5, 1)).not.toEqual(bar(5, 2));
    expect(bar(5)).not.toEqual(bar(6));
  });

  it("keeps every event inside the bar, in order, with sensible loudness", () => {
    for (let index = 0; index < 64; index += 1) {
      const events = bar(index);
      expect(events.length).toBeGreaterThan(8);
      for (const [i, event] of events.entries()) {
        expect(event.at).toBeGreaterThanOrEqual(0);
        expect(event.at).toBeLessThan(BAR);
        expect(event.velocity).toBeGreaterThan(0);
        expect(event.velocity).toBeLessThanOrEqual(1);
        expect(event.duration).toBeGreaterThan(0);
        if (i > 0) expect(event.at).toBeGreaterThanOrEqual(events[i - 1]!.at);
      }
    }
  });

  it("is shaped like a song: a quiet intro, then grooves, melodies and a drumless breath", () => {
    expect(sectionFor(0)).toBe("intro");
    const form = Array.from({ length: 16 }, (_, p) => sectionFor(p + 1));
    for (const section of ["groove", "melody", "breath"]) expect(form).toContain(section);
    expect(form.slice(0, 8)).toEqual(form.slice(8)); // and it comes round again
    for (const index of [0, 1, 2, 3]) {
      expect(voice(bar(index), "kick")).toHaveLength(0);
      expect(voice(bar(index), "lead")).toHaveLength(0);
    }
  });

  it("has a pulse wherever the drums play: a kick on the downbeat, two backbeats, and hats", () => {
    let checked = 0;
    for (let index = 0; index < 64; index += 1) {
      const events = bar(index);
      if (!withDrums(index)) {
        expect(voice(events, "snare")).toHaveLength(0);
        expect(voice(events, "hat")).toHaveLength(0);
        continue;
      }
      checked += 1;
      expect(voice(events, "kick").some((e) => e.at < 0.01)).toBe(true);
      const backbeats = voice(events, "snare").filter((e) => [1, 3].some((b) => Math.abs(e.at - b * BEAT) < 0.02));
      expect(backbeats).toHaveLength(2);
      const hats = voice(events, "hat").length;
      expect(hats).toBeGreaterThanOrEqual(5);
      expect(hats).toBeLessThanOrEqual(8);
    }
    expect(checked).toBeGreaterThan(32);
  });

  it("plays the chord's own notes on the keys and pad, and its root in the bass", () => {
    for (let index = 0; index < 64; index += 1) {
      const chord = chordAt(index, SEED);
      const events = bar(index);
      const keys = voice(events, "keys");
      expect(keys.length).toBeGreaterThanOrEqual(8);
      for (const note of [...keys, ...voice(events, "pad")]) expect(chord.notes).toContain(note.midi);
      const bass = voice(events, "bass");
      if (index < 2) {
        expect(bass).toHaveLength(0); // the bass comes in halfway through the intro
        continue;
      }
      expect(bass[0]!.midi).toBe(chord.bass);
      expect(bass[0]!.at).toBeLessThan(0.01);
      // Anything else is the root, its fifth, or a semitone step into the next chord.
      const following = chordAt(index + 1, SEED).bass;
      for (const note of bass) expect([chord.bass, chord.bass + 7, following - 1, following + 1]).toContain(note.midi);
    }
  });

  it("holds a progression for eight bars and never repeats it straight away", () => {
    for (let phrase = 0; phrase < 40; phrase += 2) {
      expect(PROGRESSIONS).toContain(progressionFor(phrase, SEED));
      expect(progressionFor(phrase + 1, SEED)).toBe(progressionFor(phrase, SEED));
      expect(progressionFor(phrase + 2, SEED)).not.toBe(progressionFor(phrase, SEED));
    }
    const first = [0, 1, 2, 3].map((i) => chordAt(i, SEED).bass);
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it("keeps the lead on the pentatonic scale, the bass low and the keys mid", () => {
    for (let index = 0; index < 64; index += 1) {
      const events = bar(index);
      for (const note of voice(events, "lead")) expect(LEAD_NOTES).toContain(note.midi);
      for (const note of voice(events, "bass")) expect(note.midi!).toBeLessThan(55);
      for (const note of [...voice(events, "keys"), ...voice(events, "pad")]) {
        expect(note.midi!).toBeGreaterThanOrEqual(50);
        expect(note.midi!).toBeLessThan(72);
      }
    }
    // The lead sometimes rests and sometimes plays.
    const withLead = Array.from({ length: 64 }, (_, i) => voice(bar(i), "lead").length > 0);
    expect(withLead).toContain(true);
    expect(withLead).toContain(false);
  });

  it("repeats its melody: the motif in a phrase's first bar comes back two bars later with the same rhythm", () => {
    for (let phrase = 1; phrase < 16; phrase += 1) {
      if (sectionFor(phrase) !== "melody") continue;
      const rhythm = (index: number) => voice(bar(index), "lead").map((e) => Math.round(e.at / (BEAT / 4)));
      expect(rhythm(phrase * 4).length).toBeGreaterThan(1);
      expect(rhythm(phrase * 4 + 2)).toEqual(rhythm(phrase * 4));
    }
  });

  it("swings the offbeat hats late", () => {
    expect(SWING).toBeGreaterThan(0);
    expect(SWING).toBeLessThan(1 / 6 + 1e-9);
    // Over many bars, the average offbeat hit sits later than straight eighths.
    let late = 0;
    let count = 0;
    for (let index = 0; index < 64; index += 1) {
      for (const hat of voice(bar(index), "hat")) {
        const eighth = hat.at / (BEAT / 2);
        const nearest = Math.round(eighth);
        if (nearest % 2 === 1) {
          late += eighth - nearest;
          count += 1;
        }
      }
    }
    expect(late / count).toBeGreaterThan(SWING * 2 * 0.6);
  });

  it("converts MIDI numbers to frequencies", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });
});
