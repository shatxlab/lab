import { describe, expect, it } from "vitest";

import { BAR, BEAT, BPM, LEAD_NOTES, PROGRESSIONS, SWING, midiToHz, planBar, progressionFor } from "@/lib/focus/lofi";

const SEED = 42;
const bar = (index: number, seed = SEED) => planBar(index, seed);
const voice = (events: ReturnType<typeof planBar>, name: string) => events.filter((e) => e.voice === name);

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

  it("always has a pulse: a kick on the downbeat, two snares, and hats", () => {
    for (let index = 0; index < 32; index += 1) {
      const events = bar(index);
      expect(voice(events, "kick").some((e) => e.at < 0.01)).toBe(true);
      expect(voice(events, "snare")).toHaveLength(2);
      const hats = voice(events, "hat").length;
      expect(hats).toBeGreaterThanOrEqual(5);
      expect(hats).toBeLessThanOrEqual(8);
    }
  });

  it("plays the chord's own notes and its root in the bass", () => {
    for (let index = 0; index < 16; index += 1) {
      const chord = progressionFor(Math.floor(index / 4), SEED)[index % 4]!;
      const events = bar(index);
      const keys = voice(events, "keys");
      expect(keys.length).toBeGreaterThanOrEqual(8);
      for (const note of keys) expect(chord.notes).toContain(note.midi);
      const bass = voice(events, "bass");
      expect(bass[0]!.midi).toBe(chord.bass);
      for (const note of bass) expect([chord.bass, chord.bass + 7]).toContain(note.midi);
    }
  });

  it("changes chords every bar and the loop every four", () => {
    const first = [0, 1, 2, 3].map((i) => voice(bar(i), "bass")[0]!.midi);
    expect(new Set(first).size).toBeGreaterThan(1);
    // Every loop is four chords drawn from the known set.
    for (let phrase = 0; phrase < 20; phrase += 1) expect(PROGRESSIONS).toContain(progressionFor(phrase, SEED));
    const seen = new Set(Array.from({ length: 40 }, (_, p) => PROGRESSIONS.indexOf(progressionFor(p, SEED))));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("keeps the lead on the pentatonic scale and the bass low and the keys mid", () => {
    for (let index = 0; index < 64; index += 1) {
      const events = bar(index);
      for (const note of voice(events, "lead")) expect(LEAD_NOTES).toContain(note.midi);
      for (const note of voice(events, "bass")) expect(note.midi!).toBeLessThan(55);
      for (const note of voice(events, "keys")) {
        expect(note.midi!).toBeGreaterThanOrEqual(50);
        expect(note.midi!).toBeLessThan(70);
      }
    }
    // The lead sometimes rests and sometimes plays.
    const withLead = Array.from({ length: 64 }, (_, i) => voice(bar(i), "lead").length > 0);
    expect(withLead).toContain(true);
    expect(withLead).toContain(false);
  });

  it("swings the offbeat hats late", () => {
    expect(SWING).toBeGreaterThan(0);
    expect(SWING).toBeLessThan(1 / 3 + 1e-9);
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
    expect(late / count).toBeGreaterThan(SWING * 0.6);
  });

  it("converts MIDI numbers to frequencies", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });
});
