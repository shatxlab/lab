import { describe, expect, it } from "vitest";

import { formatRoute, osrmUrl, parseRoute } from "@/lib/maps/route";

describe("osrm routing", () => {
  it("builds a lon,lat profile URL for the public routers", () => {
    const url = osrmUrl(
      "car",
      { lat: 55.7512, lon: 37.6184 },
      { lat: 55.7401, lon: 37.6032 },
    );
    expect(url).toBe(
      "https://routing.openstreetmap.de/routed-car/route/v1/driving/37.618400,55.751200;37.603200,55.740100?overview=full&geometries=geojson",
    );
  });

  it("parses distance, duration and the GeoJSON line", () => {
    const result = parseRoute({
      code: "Ok",
      routes: [
        {
          distance: 2974.4,
          duration: 298.3,
          geometry: { coordinates: [[37.61, 55.75], [37.62, 55.76], [37.63, 55.77]] },
        },
      ],
    });
    expect(result.distance).toBe(2974.4);
    expect(result.duration).toBe(298.3);
    expect(result.coords).toHaveLength(3);
    expect(result.coords[0]).toEqual([37.61, 55.75]);
  });

  it("throws when there is no route", () => {
    expect(() => parseRoute({ code: "NoRoute", routes: [] })).toThrow("no route");
    expect(() => parseRoute(null)).toThrow("no route");
  });

  it("formats short and long summaries in both languages", () => {
    expect(formatRoute(2974.4, 298.3, "en")).toBe("3.0 km · 5 min");
    expect(formatRoute(2974.4, 298.3, "ru")).toBe("3,0 км · 5 мин");
    expect(formatRoute(12345, 3900, "en")).toBe("12 km · 1 h 5 min");
    expect(formatRoute(12345, 3540, "ru")).toBe("12 км · 59 мин");
    expect(formatRoute(300, 40, "en")).toBe("0.3 km · 1 min");
  });
});
