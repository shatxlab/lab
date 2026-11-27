/**
 * Client for the Photon geocoder (https://photon.komoot.io) — the free,
 * keyless OSM search. The public instance CORS-allows any origin and returns
 * GeoJSON; the map view center is passed along as `lat`/`lon` so results are
 * biased to what is on screen ( Photon ranks by distance to them).
 */

export interface PlaceResult {
  /** Primary label, e.g. "Красная площадь" or "Ленинский проспект 15". */
  name: string;
  /** Context line, e.g. "Москва, Россия". */
  detail: string;
  lat: number;
  lon: number;
  /** Coarse kind, used for the result icon; free-form OSM value otherwise. */
  kind: string;
  /** Stable identity so React keys survive re-renders and re-fetches. */
  key: string;
}

export interface MapCenter {
  lat: number;
  lon: number;
}

const PHOTON_ENDPOINT = "https://photon.komoot.io/api";

/**
 * Build the search URL. Pure and exported for tests. `lang` only knows
 * "en"/"de"/"fr" on the public instance — the default already returns local
 * (Russian) names, so language is deliberately not sent.
 */
export function photonUrl(query: string, center?: MapCenter, limit = 8): string {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (center) {
    params.set("lat", center.lat.toFixed(5));
    params.set("lon", center.lon.toFixed(5));
  }
  return `${PHOTON_ENDPOINT}?${params.toString()}`;
}

/** Context line for a Photon feature: street+number, city/district, country. */
function detailOf(p: Record<string, unknown>): string {
  const parts = [
    [p.street, p.housenumber].filter(Boolean).join(" "),
    (p.city as string) || (p.district as string) || (p.county as string),
    p.state as string,
    p.country as string,
  ]
    .filter((v): v is string => Boolean(v))
    .filter((v, i, all) => all.indexOf(v) === i);
  return parts.join(", ");
}

/** Map a Photon GeoJSON FeatureCollection to our result list. */
export function parsePhoton(data: unknown): PlaceResult[] {
  const features =
    (data as { features?: unknown[] } | null)?.features ?? [];
  const seen = new Set<string>();
  const out: PlaceResult[] = [];
  for (const feature of features) {
    const f = feature as {
      properties?: Record<string, unknown>;
      geometry?: { coordinates?: [number, number] };
    };
    const p = f.properties ?? {};
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    const house = [p.street, p.housenumber].filter(Boolean).join(" ");
    const name = ((p.name as string) || house || "").trim();
    if (!name) continue;
    const kind = [p.osm_key, p.osm_value].filter(Boolean).join("/");
    const detail = detailOf(p);
    // Dedupe identical labels at the same spot (stations come as 3 records).
    const key = `${name}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      detail,
      lat,
      lon,
      kind,
      key: `${p.osm_type ?? ""}${p.osm_id ?? ""}-${key}`,
    });
  }
  return out;
}

/** Run one search against Photon. Throws on network/server errors. */
export async function searchPlaces(
  query: string,
  center?: MapCenter,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const response = await fetch(photonUrl(query, center), { signal });
  if (!response.ok) throw new Error(`photon ${response.status}`);
  return parsePhoton(await response.json());
}
