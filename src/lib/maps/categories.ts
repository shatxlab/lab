/**
 * Category search ("find a cafe/pharmacy/metro on screen"): instead of asking
 * a geocoder, this reads the POI features the map has already loaded in the
 * current viewport — the vector tiles' own data. Works against the online
 * OpenFreeMap styles (OpenMapTiles schema: `poi` layer with `class`/`subclass`
 * fields) and against local PMTiles archives (Protomaps schema: `pois` layer
 * with a `kind` field) alike, and offline too, because the tiles are already
 * in the tab.
 */

export interface CategoryDef {
  id: string;
  icon: string;
  /** Field values that mark a hit in any schema. */
  values: string[];
}

export const CATEGORIES: readonly CategoryDef[] = [
  { id: "cafe", icon: "☕", values: ["cafe"] },
  { id: "restaurant", icon: "🍽", values: ["restaurant"] },
  { id: "supermarket", icon: "🛒", values: ["supermarket", "grocery", "greengrocer"] },
  { id: "pharmacy", icon: "💊", values: ["pharmacy"] },
  { id: "fuel", icon: "⛽", values: ["fuel", "petrolstation"] },
  { id: "metro", icon: "🚇", values: ["station", "subway", "train_station"] },
  { id: "bank", icon: "🏦", values: ["bank", "atm"] },
  { id: "hotel", icon: "🏨", values: ["hotel", "hostel", "motel"] },
  { id: "hospital", icon: "🏥", values: ["hospital", "clinic"] },
];

/** Fields every schema encodes POI kinds into (checked in this order). */
const KIND_FIELDS = ["kind", "class", "subclass", "amenity", "vending"] as const;

export function categoryById(id: string): CategoryDef | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

/** Does one tile feature's properties match the category? */
export function featureMatches(
  properties: Record<string, unknown> | undefined,
  category: CategoryDef,
): boolean {
  if (!properties) return false;
  for (const field of KIND_FIELDS) {
    const value = properties[field];
    if (typeof value === "string" && category.values.includes(value)) return true;
  }
  return false;
}

export interface PoiHit {
  name: string;
  lat: number;
  lon: number;
}

export interface RawPoiFeature {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: number[] } | null;
}

/** Pick features out of a query result: named, matching, deduped, closest first. */
export function collectPois(
  features: readonly RawPoiFeature[],
  category: CategoryDef,
  center?: { lat: number; lon: number },
  limit = 50,
): PoiHit[] {
  const seen = new Set<string>();
  const hits: (PoiHit & { distance: number })[] = [];
  for (const feature of features) {
    if (!featureMatches(feature.properties, category)) continue;
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    const name = String(feature.properties?.name ?? "").trim();
    if (!name) continue;
    // Same shop mapped once per tile boundary — dedupe on name + rough spot.
    const key = `${name}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distance = center
      ? Math.hypot(lat - center.lat, (lon - center.lon) * Math.cos((center.lat * Math.PI) / 180))
      : 0;
    hits.push({ name, lat, lon, distance });
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits.slice(0, limit).map(({ name, lat, lon }) => ({ name, lat, lon }));
}

/** Source layers where POIs live, per known tile schema. */
export const POI_SOURCE_LAYERS = ["poi", "pois", "transit"] as const;
