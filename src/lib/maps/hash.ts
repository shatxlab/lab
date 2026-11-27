/**
 * The URL hash mirrors the full map state so any view is shareable and the
 * back button restores places, like OpenStreetMap does:
 *
 *   `#map=<zoom>/<lat>/<lon>` — the viewport
 *   `&s=<lat>,<lon>,<name>`   — route start, when chosen
 *   `&e=<lat>,<lon>,<name>`   — route destination, when chosen
 *
 * Pure functions, unit-tested.
 */

export interface MapView {
  zoom: number;
  lat: number;
  lon: number;
}

export interface EndpointState {
  name: string;
  lat: number;
  lon: number;
}

export interface MapState {
  view: MapView | null;
  start: EndpointState | null;
  end: EndpointState | null;
}

export const DEFAULT_VIEW: MapView = { zoom: 11, lat: 55.7558, lon: 37.6173 };

export function encodeView(view: MapView): string {
  return `map=${view.zoom.toFixed(2)}/${view.lat.toFixed(5)}/${view.lon.toFixed(5)}`;
}

function encodeEndpoint(key: "s" | "e", p: EndpointState): string {
  const name = encodeURIComponent(p.name).replace(/,/g, "%2C");
  return `${key}=${p.lat.toFixed(5)},${p.lon.toFixed(5)},${name}`;
}

function encodeStatePart(key: "s" | "e", p: EndpointState | null): string {
  return p ? `&${encodeEndpoint(key, p)}` : "";
}

export function encodeState(view: MapView, start: EndpointState | null, end: EndpointState | null): string {
  return `${encodeView(view)}${encodeStatePart("s", start)}${encodeStatePart("e", end)}`;
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

function decodeEndpoint(hash: string, key: "s" | "e"): EndpointState | null {
  const match = new RegExp(`[&#]${key}=(-?[0-9.]+),(-?[0-9.]+),([^&]+)`).exec(hash);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, name: decodeURIComponent(match[3]) };
}

/** Full state out of a location hash; missing parts come back as null. */
export function parseState(hash: string): MapState {
  return { view: decodeView(hash), start: decodeEndpoint(hash, "s"), end: decodeEndpoint(hash, "e") };
}
