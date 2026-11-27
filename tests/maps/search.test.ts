import { describe, expect, it } from "vitest";

import { parsePhoton, photonUrl } from "@/lib/maps/search";

/** Shaped like a trimmed Photon response (two features, one duplicate). */
const SAMPLE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        osm_type: "R",
        osm_id: 1577673,
        osm_key: "place",
        osm_value: "square",
        name: "Красная площадь",
        city: "Москва",
        state: "Москва",
        country: "Россия",
      },
      geometry: { type: "Point", coordinates: [37.6208, 55.7539] },
    },
    {
      type: "Feature",
      properties: {
        osm_type: "R",
        osm_id: 451292,
        osm_key: "building",
        osm_value: "commercial",
        name: "Центральный телеграф",
        street: "Тверская улица",
        housenumber: "7",
        city: "Москва",
        country: "Россия",
      },
      geometry: { type: "Point", coordinates: [37.6116, 55.7583] },
    },
    {
      // Same name and spot as the first one — must be deduped.
      type: "Feature",
      properties: {
        osm_type: "N",
        osm_id: 999,
        name: "Красная площадь",
        city: "Москва",
      },
      geometry: { type: "Point", coordinates: [37.62081, 55.75391] },
    },
  ],
};

describe("photon search", () => {
  it("biases queries to the current map center", () => {
    const url = new URL(photonUrl("Тверская 7", { lat: 55.75, lon: 37.61 }));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api");
    expect(url.searchParams.get("q")).toBe("Тверская 7");
    expect(url.searchParams.get("lat")).toBe("55.75000");
    expect(url.searchParams.get("lon")).toBe("37.61000");
  });

  it("parses names, address lines and coordinates", () => {
    const results = parsePhoton(SAMPLE);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Красная площадь");
    expect(results[0].detail).toContain("Москва");
    expect(results[0].lat).toBeCloseTo(55.7539, 4);
    expect(results[0].lon).toBeCloseTo(37.6208, 4);
    expect(results[1].name).toBe("Центральный телеграф");
    expect(results[1].detail).toContain("Тверская улица 7");
  });

  it("falls back to the street+house line when there is no name", () => {
    const results = parsePhoton({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { street: "Профсоюзная улица", housenumber: "42" },
          geometry: { type: "Point", coordinates: [37.5, 55.6] },
        },
      ],
    });
    expect(results[0].name).toBe("Профсоюзная улица 42");
  });

  it("drops features without usable labels or coordinates", () => {
    expect(
      parsePhoton({
        type: "FeatureCollection",
        features: [
          { properties: {}, geometry: { type: "Point", coordinates: [1, 2] } },
          { properties: { name: "x" }, geometry: { type: "Point", coordinates: [] } },
        ],
      }),
    ).toHaveLength(0);
    expect(parsePhoton(null)).toHaveLength(0);
  });
});
