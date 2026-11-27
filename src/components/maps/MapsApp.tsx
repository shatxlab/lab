import * as React from "react";
import { addProtocol, GeolocateControl, LngLatBounds, Map as MlMap, Marker, NavigationControl, type StyleSpecification } from "maplibre-gl";

import { ToolPage, inputClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { decodeView, DEFAULT_VIEW, encodeView, type MapView } from "@/lib/maps/hash";
import { mb } from "@/lib/maps/i18n";
import { searchPlaces, type PlaceResult } from "@/lib/maps/search";
import { fetchRoute, formatRoute, type RouteProfile, type RouteResult } from "@/lib/maps/route";
import {
  getPmtilesProtocol,
  pmtilesRasterStyle,
  pmtilesVectorStyle,
  registerLocalPmtiles,
  styleForHeader,
  type PmtilesTheme,
} from "@/lib/maps/pmtiles";

import "maplibre-gl/dist/maplibre-gl.css";

type StyleId = "liberty" | "positron" | "dark";

const STYLES: Record<StyleId, string> = {
  liberty: "https://tiles.openfreemap.org/styles/liberty",
  positron: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Keyless free vector tiles; the style JSON carries the tile URLs. */
function styleFor(id: StyleId): string | StyleSpecification {
  return STYLES[id];
}

export default function MapsApp() {
  const lang = useAppLang();
  const t = React.useMemo(() => (key: Parameters<typeof mb>[1]) => mb(lang, key), [lang]);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const markerRef = React.useRef<Marker | null>(null);
  const [style, setStyle] = React.useState<StyleId>("liberty");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<PlaceResult[] | null>(null);
  const [status, setStatus] = React.useState<"idle" | "searching" | "failed">("idle");
  const [selected, setSelected] = React.useState<PlaceResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [routeStart, setRouteStart] = React.useState<PlaceResult | null>(null);
  const [routeEnd, setRouteEnd] = React.useState<PlaceResult | null>(null);
  const [profile, setProfile] = React.useState<RouteProfile>("car");
  const [route, setRoute] = React.useState<RouteResult | null>(null);
  const [routeState, setRouteState] = React.useState<"idle" | "loading" | "failed">("idle");
  const [archive, setArchive] = React.useState<{ name: string } | null>(null);
  const [archiveError, setArchiveError] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Start from the URL hash (#map=zoom/lat/lon) so shared links open in place.
  const initialView = React.useRef<MapView>(
    decodeView(typeof window === "undefined" ? "" : window.location.hash) ?? DEFAULT_VIEW,
  );

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Local .pmtiles archives are served through this custom protocol.
    addProtocol("pmtiles", getPmtilesProtocol().tile);
    const map = new MlMap({
      container: containerRef.current,
      style: styleFor(style),
      center: [initialView.current.lon, initialView.current.lat],
      zoom: initialView.current.zoom,
      hash: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new GeolocateControl({ trackUserLocation: false }), "bottom-right");

    // Mirror the view into the hash without flooding history.
    let replace = true;
    map.on("moveend", () => {
      const hash = encodeView({ zoom: map.getZoom(), lat: map.getCenter().lat, lon: map.getCenter().lng });
      const url = `${window.location.pathname}${window.location.search}#${hash}`;
      if (replace) {
        window.history.replaceState(null, "", url);
        replace = false;
      } else {
        window.history.pushState(null, "", url);
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // A local archive replaces the online style entirely.
    if (archive) {
      const key = archive.name;
      const instance = getPmtilesProtocol().get(key);
      if (!instance) return;
      instance
        .getHeader()
        .then((header) => {
          map.setStyle(
            styleForHeader(header) === "vector"
              ? pmtilesVectorStyle(`pmtiles://${key}`, style === "dark" ? "dark" : "light", lang)
              : pmtilesRasterStyle(`pmtiles://${key}`),
          );
          if (header.minLon < header.maxLon && header.minLat < header.maxLat) {
            map.fitBounds(
              [
                [header.minLon, header.minLat],
                [header.maxLon, header.maxLat],
              ],
              { padding: 40, duration: 600 },
            );
          }
        })
        .catch(() => setArchiveError(true));
      return;
    }
    map.setStyle(styleFor(style));
  }, [archive, style, lang]);

  const openArchive = React.useCallback((file: File | undefined) => {
    if (!file || !file.name.toLowerCase().endsWith(".pmtiles")) return;
    setArchiveError(false);
    try {
      registerLocalPmtiles(file);
      setArchive({ name: file.name });
    } catch {
      setArchiveError(true);
    }
  }, []);

  // Debounced search biased to the current map center.
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const map = mapRef.current;
      const center = map ? { lat: map.getCenter().lat, lon: map.getCenter().lng } : undefined;
      setStatus("searching");
      searchPlaces(trimmed, center, controller.signal)
        .then((found) => {
          setResults(found);
          setStatus("idle");
        })
        .catch((error: unknown) => {
          if ((error as Error).name === "AbortError") return;
          setStatus("failed");
          setResults(null);
        });
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const pick = React.useCallback((place: PlaceResult) => {
    setSelected(place);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), 16), speed: 1.4 });
    markerRef.current?.remove();
    markerRef.current = new Marker({ color: "#e15b64" })
      .setLngLat([place.lon, place.lat])
      .addTo(map);
  }, []);

  const dropRouteMarker = React.useRef<Marker | null>(null);

  const setEndpoint = React.useCallback((which: "start" | "end", place: PlaceResult | null) => {
    if (which === "start") {
      setRouteStart(place);
      dropRouteMarker.current?.remove();
      dropRouteMarker.current = null;
      const map = mapRef.current;
      if (place && map) {
        dropRouteMarker.current = new Marker({ color: "#2f9e44" })
          .setLngLat([place.lon, place.lat])
          .addTo(map);
      }
    } else {
      setRouteEnd(place);
    }
    setResults(null);
    setQuery("");
  }, []);

  const copyView = React.useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  }, []);

  // Re-route (or drop the line) whenever endpoints or profile change.
  React.useEffect(() => {
    if (!routeStart || !routeEnd) {
      setRoute(null);
      setRouteState("idle");
      return;
    }
    const controller = new AbortController();
    setRouteState("loading");
    fetchRoute(profile, routeStart, routeEnd, controller.signal)
      .then((found) => {
        setRoute(found);
        setRouteState("idle");
      })
      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") return;
        setRoute(null);
        setRouteState("failed");
      });
    return () => controller.abort();
  }, [profile, routeStart, routeEnd]);

  // Draw the route line once a result is in.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("route-line")) map.removeLayer("route-line");
    if (map.getSource("route")) map.removeSource("route");
    if (!route) return;
    map.addSource("route", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coords } },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#e15b64", "line-width": 5, "line-opacity": 0.9 },
    });
    const bounds = route.coords.reduce(
      (acc, [lon, lat]) => acc.extend([lon, lat]),
      new LngLatBounds(),
    );
    map.fitBounds(bounds, { padding: 60, duration: 600 });
  }, [route, archive, style]);

  const listId = "maps-results";

  return (
    <ToolPage title={t("title")} tagline={t("tagline")} wide fill>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <label className="sr-only" htmlFor="maps-search">
              {t("searchLabel")}
            </label>
            <input
              id="maps-search"
              type="search"
              className={inputClass}
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              role="combobox"
              aria-expanded={results !== null}
              aria-controls={listId}
              aria-autocomplete="list"
            />
            {query && (
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-sm text-(--muted-fg) hover:text-(--fg)"
                onClick={() => setQuery("")}
                aria-label={t("clearSearch")}
              >
                ✕
              </button>
            )}
            {results && results.length > 0 && (
              <ul
                id={listId}
                role="listbox"
                className="absolute top-full right-0 left-0 z-10 max-h-80 overflow-y-auto rounded-md border border-(--border) bg-(--surface) shadow-lg"
              >
                {results.map((place) => (
                  <li key={place.key} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected?.key === place.key}
                      className="block w-full px-3 py-2 text-left hover:bg-(--accent)/10 focus-visible:bg-(--accent)/10"
                      onClick={() => pick(place)}
                    >
                      <span className="block text-sm text-(--fg)">{place.name}</span>
                      {place.detail && (
                        <span className="block text-xs text-(--muted-fg)">{place.detail}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div
            className="flex items-center gap-1 rounded-md border border-(--border) p-1"
            role="group"
            aria-label={t("styleLabel")}
          >
            {(["liberty", "positron", "dark"] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`rounded px-2 py-1 text-xs ${style === id ? "bg-(--accent) text-white" : "text-(--muted-fg) hover:text-(--fg)"}`}
                onClick={() => setStyle(id)}
                aria-pressed={style === id}
              >
                {t(`style${id[0].toUpperCase()}${id.slice(1)}` as Parameters<typeof mb>[1])}
              </button>
            ))}
          </div>
          <button type="button" className="rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--fg)" onClick={copyView}>
            {copied ? t("hashCopied") : "🔗"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pmtiles"
            className="hidden"
            aria-label={t("openFile")}
            onChange={(event) => {
              openArchive(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--fg)"
            onClick={() => fileInputRef.current?.click()}
          >
            {archive ? `🗂 ${archive.name}` : t("openFile")}
          </button>
          {archive && (
            <button
              type="button"
              className="rounded-md border border-(--border) px-2 py-1.5 text-xs text-(--muted-fg) hover:text-(--fg)"
              onClick={() => setArchive(null)}
            >
              {t("closeFile")}
            </button>
          )}
        </div>

        <p aria-live="polite" className="text-xs text-(--muted-fg)">
          {archiveError ? t("fileFailed") : ""}
          {status === "searching" ? t("searching") : ""}
          {status === "failed" ? t("searchFailed") : ""}
          {results && results.length === 0 && status === "idle" ? t("noResults") : ""}
        </p>

        {selected && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-(--border) bg-(--surface) px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-(--fg)">
              {selected.name}
              {selected.detail ? <span className="text-(--muted-fg)"> — {selected.detail}</span> : null}
            </span>
            <button
              type="button"
              className="rounded-md border border-(--border) px-2 py-1 text-xs text-(--fg)"
              onClick={() => setEndpoint("start", selected)}
            >
              {t("routeFromHere")}
            </button>
            <button
              type="button"
              className="rounded-md border border-(--border) px-2 py-1 text-xs text-(--fg)"
              onClick={() => setEndpoint("end", selected)}
            >
              {t("routeToHere")}
            </button>
          </div>
        )}

        {(routeStart || routeEnd) && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-md border border-(--border) p-1"
              role="group"
              aria-label={t("styleLabel")}
            >
              {(["car", "bike", "foot"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded px-2 py-1 text-xs ${profile === id ? "bg-(--accent) text-white" : "text-(--muted-fg) hover:text-(--fg)"}`}
                  onClick={() => setProfile(id)}
                  aria-pressed={profile === id}
                >
                  {t(`profile${id[0].toUpperCase()}${id.slice(1)}` as Parameters<typeof mb>[1])}
                </button>
              ))}
            </div>
            <span aria-live="polite" className="text-sm text-(--fg)">
              {routeState === "loading"
                ? t("routing")
                : routeState === "failed"
                  ? t("routeFailed")
                  : route
                    ? `${t("routeStart")}: ${routeStart?.name} → ${t("routeFinish")}: ${routeEnd?.name} — ${formatRoute(route.distance, route.duration, lang)}`
                    : ""}
            </span>
            <button
              type="button"
              className="rounded-md border border-(--border) px-2 py-1 text-xs text-(--muted-fg) hover:text-(--fg)"
              onClick={() => {
                dropRouteMarker.current?.remove();
                dropRouteMarker.current = null;
                setRouteStart(null);
                setRouteEnd(null);
              }}
            >
              {t("routeClear")}
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          className="min-h-[60vh] flex-1 overflow-hidden rounded-xl border border-(--border)"
          role="application"
          aria-label={t("map")}
        />
        <p className="text-xs text-(--muted-fg)">{t("attribution")}</p>
      </div>
    </ToolPage>
  );
}
