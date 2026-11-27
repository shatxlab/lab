/**
 * PMTiles support: open a local `.pmtiles` archive (a whole map in one file,
 * e.g. a Protomaps daily planet build) and render it with zero servers.
 *
 * The `pmtiles` protocol is registered once per page; local files are served
 * from the tab through `FileSource` (range requests against the File object),
 * so nothing is uploaded. Protomaps-style vector archives get a full style
 * from `protomaps-themes-base`; raster archives get a plain raster style.
 */
import { FileSource, PMTiles, Protocol, type Header, TileType } from "pmtiles";
import { layers as protomapsLayers, namedTheme } from "protomaps-themes-base";
import type { StyleSpecification } from "maplibre-gl";

export type PmtilesTheme = "light" | "dark";

let protocol: Protocol | null = null;

/** The single PMTiles protocol instance registered with MapLibre. */
export function getPmtilesProtocol(): Protocol {
  if (!protocol) {
    protocol = new Protocol();
  }
  return protocol;
}

/** The source URL MapLibre should use for a locally opened file. */
export function registerLocalPmtiles(file: File): string {
  const instance = new PMTiles(new FileSource(file));
  // FileSource keys by file name; re-registering the same name replaces it.
  getPmtilesProtocol().add(instance);
  return `pmtiles://${file.name}`;
}

/** Glyphs and sprites live on CDNs; tiles themselves stay local. */
export const PMTILES_GLYPHS = "https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf";
export const PMTILES_SPRITE = (theme: PmtilesTheme) =>
  `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`;

/** Full Protomaps-flavoured style for a vector (MVT) archive. */
export function pmtilesVectorStyle(
  sourceUrl: string,
  theme: PmtilesTheme,
  lang: "en" | "ru",
): StyleSpecification {
  return {
    version: 8,
    glyphs: PMTILES_GLYPHS,
    sprite: PMTILES_SPRITE(theme),
    sources: {
      protomaps: { type: "vector", url: sourceUrl },
    },
    layers: protomapsLayers("protomaps", namedTheme(theme), { lang }) as StyleSpecification["layers"],
  };
}

/** Minimal style for raster (PNG/JPEG/WebP) archives. */
export function pmtilesRasterStyle(sourceUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      archive: { type: "raster", url: sourceUrl },
    },
    layers: [{ id: "archive", type: "raster", source: "archive" }],
  };
}

/** Which style an archive needs, from its header. */
export function styleForHeader(header: Header): "vector" | "raster" {
  return header.tileType === TileType.Mvt || header.tileType === TileType.Mlt ? "vector" : "raster";
}
