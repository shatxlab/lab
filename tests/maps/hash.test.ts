import { describe, expect, it } from "vitest";

import { encodeState, parseState, DEFAULT_VIEW } from "@/lib/maps/hash";

const START = { name: "Центральный телеграф", lat: 55.75831, lon: 37.61164 };
const END = { name: "Арбат, 14, стр. 1", lat: 55.75291, lon: 37.59261 };

describe("maps state hash", () => {
  it("round-trips the view alone", () => {
    const state = parseState(`#${encodeState({ zoom: 16.4, lat: 55.75124, lon: 37.6184 }, null, null)}`);
    expect(state.view!.zoom).toBeCloseTo(16.4, 2);
    expect(state.view!.lat).toBeCloseTo(55.75124, 5);
    expect(state.start).toBeNull();
    expect(state.end).toBeNull();
  });

  it("round-trips both endpoints with Cyrillic and commas in names", () => {
    const hash = encodeState({ zoom: 14.15, lat: 55.67927, lon: 37.66224 }, START, END);
    const state = parseState(`#${hash}`);
    expect(state.view!.zoom).toBeCloseTo(14.15, 2);
    expect(state.start).toEqual(START);
    expect(state.end).toEqual(END);
  });

  it("round-trips the start alone and reads OSM-style hashes with other params", () => {
    const state = parseState(`#foo=1&${encodeState({ zoom: 12, lat: 55.75, lon: 37.61 }, START, null)}&x=2`);
    expect(state.view).toEqual({ zoom: 12, lat: 55.75, lon: 37.61 });
    expect(state.start).toEqual(START);
    expect(state.end).toBeNull();
  });

  it("rejects garbage, out-of-range values and missing hashes", () => {
    const empty = parseState("");
    expect(empty.view).toBeNull();
    expect(empty.start).toBeNull();
    expect(parseState("#hello").view).toBeNull();
    expect(parseState("#map=99/55/37").view).toBeNull();
    expect(parseState("#map=12/999/37").view).toBeNull();
    expect(parseState("#map=12/55/999&e=not-a-point").start).toBeNull();
  });

  it("starts somewhere sensible when the link has no view", () => {
    expect(DEFAULT_VIEW.zoom).toBeGreaterThan(5);
  });
});
