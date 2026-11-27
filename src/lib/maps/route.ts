/**
 * Routing via the OSRM foot router of routing.openstreetmap.de — free,
 * keyless, CORS-open, no account. Walking is the only profile: this tool is
 * deliberately pedestrian-first. Coordinates are sent as `lon,lat` pairs; the
 * response comes back as GeoJSON when `geometries=geojson` is set. Pure
 * helpers are exported for tests; only `fetchRoute` touches the network.
 */

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface RouteResult {
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** GeoJSON line coordinates, `[lon, lat]` pairs. */
  coords: [number, number][];
}

const OSRM_ENDPOINT = "https://routing.openstreetmap.de";

export function osrmUrl(start: RoutePoint, end: RoutePoint): string {
  const via = `${start.lon.toFixed(6)},${start.lat.toFixed(6)};${end.lon.toFixed(6)},${end.lat.toFixed(6)}`;
  return `${OSRM_ENDPOINT}/routed-foot/route/v1/driving/${via}?overview=full&geometries=geojson`;
}

export function parseRoute(data: unknown): RouteResult {
  const routes = (data as { routes?: unknown[] } | null)?.routes ?? [];
  const route = routes[0] as
    | { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }
    | undefined;
  const coords = route?.geometry?.coordinates ?? [];
  if (!route || typeof route.distance !== "number" || coords.length < 2) {
    throw new Error("no route");
  }
  return { distance: route.distance, duration: route.duration ?? 0, coords };
}

export async function fetchRoute(
  start: RoutePoint,
  end: RoutePoint,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const response = await fetch(osrmUrl(start, end), { signal });
  if (!response.ok) throw new Error(`osrm ${response.status}`);
  return parseRoute(await response.json());
}

/** "2.97 km · 5 min" / "12 км · 1 ч 5 мин" — human summary for the panel. */
export function formatRoute(distance: number, duration: number, lang: "en" | "ru"): string {
  const kmText =
    distance >= 9950
      ? `${Math.round(distance / 1000)} ${lang === "ru" ? "км" : "km"}`
      : `${(distance / 1000).toFixed(1).replace(".", lang === "ru" ? "," : ".")} ${lang === "ru" ? "км" : "km"}`;
  const minutes = Math.max(1, Math.round(duration / 60));
  const timeText =
    minutes < 60
      ? `${minutes} ${lang === "ru" ? "мин" : "min"}`
      : `${Math.floor(minutes / 60)} ${lang === "ru" ? "ч" : "h"} ${minutes % 60} ${lang === "ru" ? "мин" : "min"}`;
  return `${kmText} · ${timeText}`;
}
