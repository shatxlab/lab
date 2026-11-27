/**
 * The map view (center + zoom) is mirrored into the URL hash so any state is
 * shareable and the back button restores places, like OpenStreetMap does:
 * `#map=<zoom>/<lat>/<lon>`. Pure functions, unit-tested.
 */

export interface MapView {
  zoom: number;
  lat: number;
  lon: number;
}

export const DEFAULT_VIEW: MapView = { zoom: 11, lat: 55.7558, lon: 37.6173 };

export function encodeView(view: MapView): string {
  return `map=${view.zoom.toFixed(2)}/${view.lat.toFixed(5)}/${view.lon.toFixed(5)}`;
}

/** Parse the view out of a location hash string; null when absent/garbled. */
export function decodeView(hash: string): MapView | null {
  const match = /(^#|&)map=([0-9.]+)\/(-?[0-9.]+)\/(-?[0-9.]+)/.exec(hash);
  if (!match) return null;
  const zoom = Number(match[2]);
  const lat = Number(match[3]);
  const lon = Number(match[4]);
  if (!Number.isFinite(zoom) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (zoom < 1 || zoom > 22 || lat < -85 || lat > 85 || lon < -180 || lon > 180) return null;
  return { zoom, lat, lon };
}
