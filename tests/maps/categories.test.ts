import { describe, expect, it } from "vitest";

import { CATEGORIES, categoryById, collectPois, featureMatches } from "@/lib/maps/categories";

/** A feature as MapLibre's querySourceFeatures hands it over. */
function feature(
  name: string,
  lon: number,
  lat: number,
  properties: Record<string, unknown>,
): { properties: Record<string, unknown>; geometry: { coordinates: [number, number] } } {
  return { properties: { name, ...properties }, geometry: { coordinates: [lon, lat] } };
}

describe("category search over loaded tiles", () => {
  const cafe = categoryById("cafe")!;

  it("matches the kind field (Protomaps) and class/subclass (OpenMapTiles)", () => {
    expect(featureMatches({ kind: "cafe" }, cafe)).toBe(true);
    expect(featureMatches({ class: "cafe", subclass: "cafe" }, cafe)).toBe(true);
    expect(featureMatches({ kind: "restaurant" }, cafe)).toBe(false);
    expect(featureMatches(undefined, cafe)).toBe(false);
  });

  it("collects named hits, dedupes, sorts by distance, caps the list", () => {
    const features = [
      feature("Кофейня", 37.61, 55.751, { kind: "cafe" }),
      feature("Кофейня", 37.610001, 55.751001, { kind: "cafe" }), // tile-edge dupe
      { properties: { kind: "cafe" }, geometry: { coordinates: [37.62, 55.76] } }, // unnamed POI
      feature("Ресторан", 37.63, 55.77, { kind: "cafe" }),
      feature("Аптека", 37.64, 55.78, { kind: "pharmacy" }), // wrong category
      feature("Дальняя", 37.99, 55.99, { kind: "cafe" }),
    ];
    const hits = collectPois(features, cafe, { lat: 55.751, lon: 37.61 });
    expect(hits.map((hit) => hit.name)).toEqual(["Кофейня", "Ресторан", "Дальняя"]);
    const small = collectPois(features, cafe, undefined, 1);
    expect(small).toHaveLength(1);
    expect(small[0].name).toBe("Кофейня");
  });

  it("keeps every category wired to a stable id and icon", () => {
    for (const category of CATEGORIES) {
      expect(category.id).toMatch(/^[a-z]+$/);
      expect(category.icon.length).toBeGreaterThan(0);
      expect(category.values.length).toBeGreaterThan(0);
    }
  });
});
