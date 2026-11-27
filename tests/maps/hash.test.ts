import { describe, expect, it } from "vitest";

import { encodeView, decodeView, DEFAULT_VIEW } from "@/lib/maps/hash";

describe("maps view hash", () => {
  it("round-trips zoom/lat/lon", () => {
    const view = { zoom: 16.4, lat: 55.75124, lon: 37.6184 };
    const decoded = decodeView(`#${encodeView(view)}`);
    expect(decoded).not.toBeNull();
    expect(decoded!.zoom).toBeCloseTo(view.zoom, 2);
    expect(decoded!.lat).toBeCloseTo(view.lat, 5);
    expect(decoded!.lon).toBeCloseTo(view.lon, 5);
  });

  it("reads an OSM-style hash with other params around it", () => {
    expect(decodeView("#foo=1&map=12/55.75/37.61&x=2")).toEqual({
      zoom: 12,
      lat: 55.75,
      lon: 37.61,
    });
  });

  it("rejects garbage, out-of-range values and missing hashes", () => {
    expect(decodeView("")).toBeNull();
    expect(decodeView("#hello")).toBeNull();
    expect(decodeView("#map=99/55/37")).toBeNull();
    expect(decodeView("#map=12/999/37")).toBeNull();
    expect(decodeView("#map=12/55/999")).toBeNull();
  });

  it("starts somewhere sensible when the link has no view", () => {
    expect(DEFAULT_VIEW.zoom).toBeGreaterThan(5);
  });
});
