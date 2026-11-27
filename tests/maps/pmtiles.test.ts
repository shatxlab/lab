import { describe, expect, it } from "vitest";

import {
  PMTILES_GLYPHS,
  PMTILES_SPRITE,
  pmtilesRasterStyle,
  pmtilesVectorStyle,
  styleForHeader,
} from "@/lib/maps/pmtiles";

/** Header-shaped objects; only the fields the code reads are filled in. */
function header(tileType: number) {
  return {
    tileType,
    specVersion: 3,
    rootDirectoryOffset: 0,
    rootDirectoryLength: 0,
    jsonMetadataOffset: 0,
    jsonMetadataLength: 0,
    leafDirectoryOffset: 0,
    leafDirectoryLength: 0,
    tileDataOffset: 0,
    tileDataLength: 0,
    numAddressedTiles: 0,
    numTileEntries: 0,
    numTileContents: 0,
    clustered: false,
    internalCompression: 2,
    tileCompression: 2,
    minZoom: 0,
    maxZoom: 14,
    minLon: 0,
    minLat: 0,
    maxLon: 0,
    maxLat: 0,
    centerZoom: 0,
    centerLon: 0,
    centerLat: 0,
  } as never;
}

describe("pmtiles local archives", () => {
  it("points glyphs and sprites at the CDNs", () => {
    expect(PMTILES_GLYPHS).toContain("{fontstack}");
    expect(PMTILES_SPRITE("dark")).toMatch(/sprites\/v4\/dark$/);
  });

  it("builds a vector style wired to the pmtiles source", () => {
    const style = pmtilesVectorStyle("pmtiles://planet.pmtiles", "light", "en");
    expect(style.glyphs).toBe(PMTILES_GLYPHS);
    expect(style.sprite).toBe(PMTILES_SPRITE("light"));
    expect(style.sources.protomaps).toMatchObject({ type: "vector", url: "pmtiles://planet.pmtiles" });
    // The Protomaps theme ships a real layer stack, land before labels.
    const ids = style.layers.map((layer) => layer.id);
    expect(ids.length).toBeGreaterThan(30);
    expect(ids).toContain("background");
    expect(ids.some((id) => id.startsWith("road"))).toBe(true);
    expect(style.layers.at(-1)!.type).toBe("symbol");
  });

  it("switches the theme with the light/dark toggle", () => {
    const light = pmtilesVectorStyle("pmtiles://a", "light", "ru");
    const dark = pmtilesVectorStyle("pmtiles://a", "dark", "ru");
    expect(JSON.stringify(light)).not.toEqual(JSON.stringify(dark));
  });

  it("raster archives get a plain raster style", () => {
    const style = pmtilesRasterStyle("pmtiles://scan.pmtiles");
    expect(style.layers).toHaveLength(1);
    expect(style.layers[0]).toMatchObject({ type: "raster", source: "archive" });
  });

  it("picks the style kind from the header tile type", () => {
    expect(styleForHeader(header(1))).toBe("vector"); // MVT
    expect(styleForHeader(header(6))).toBe("vector"); // MLT
    expect(styleForHeader(header(2))).toBe("raster"); // PNG
    expect(styleForHeader(header(3))).toBe("raster"); // JPEG
  });
});
