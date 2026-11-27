import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { GeolocateControl, LngLatBounds, Map as MlMap, Marker, NavigationControl, type GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import { ToolPage, inputClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { parseState, encodeState, DEFAULT_VIEW, type MapView } from "@/lib/maps/hash";
import { mb } from "@/lib/maps/i18n";
import { searchPlaces, type PlaceResult } from "@/lib/maps/search";
import {
  collectPois,
  CATEGORIES,
  categoryById,
  POI_SOURCE_LAYERS,
  type PoiHit,
  type RawPoiFeature,
} from "@/lib/maps/categories";
import { fetchRoute, formatRoute, type RouteResult } from "@/lib/maps/route";

import "maplibre-gl/dist/maplibre-gl.css";

/** Keyless free vector tiles; the style JSON carries the tile URLs. */
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

interface Endpoint {
  name: string;
  lat: number;
  lon: number;
}

export default function MapsApp() {
  const lang = useAppLang();
  const t = React.useMemo(() => (key: Parameters<typeof mb>[1]) => mb(lang, key), [lang]);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const startMarkerRef = React.useRef<Marker | null>(null);
  const endMarkerRef = React.useRef<Marker | null>(null);
  const toInputRef = React.useRef<HTMLInputElement | null>(null);

  const [activeField, setActiveField] = React.useState<"start" | "end">("start");
  // Text being typed per field; empty while a chosen place occupies the field.
  const [startQuery, setStartQuery] = React.useState("");
  const [endQuery, setEndQuery] = React.useState("");
  // Start from the URL hash (#map=…&s=…&e=…) so shared links restore the route.
  const initialHash = React.useRef(
    parseState(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [startPlace, setStartPlace] = React.useState<Endpoint | null>(null);
  const [endPlace, setEndPlace] = React.useState<Endpoint | null>(null);
  const [initialView] = React.useState<MapView>(initialHash.current.view ?? DEFAULT_VIEW);
  const [results, setResults] = React.useState<PlaceResult[] | null>(null);
  const [status, setStatus] = React.useState<"idle" | "searching" | "failed">("idle");
  const [copied, setCopied] = React.useState(false);
  const [route, setRoute] = React.useState<RouteResult | null>(null);
  const [routeState, setRouteState] = React.useState<"idle" | "loading" | "failed">("idle");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [categoryHits, setCategoryHits] = React.useState<PoiHit[] | null>(null);
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const [dockOffset, setDockOffset] = React.useState(0);

  // On phones the docked route block overlays the viewport; reserve exactly
  // its measured height so the map ends above it instead of hiding behind it.
  React.useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const narrow = window.matchMedia("(max-width: 639px)");
    const update = () => setDockOffset(narrow.matches ? dock.getBoundingClientRect().height : 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    narrow.addEventListener("change", update);
    return () => {
      observer.disconnect();
      narrow.removeEventListener("change", update);
    };
  }, []);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Apply the shared endpoints after mount: the server render must match the
    // first client render (empty fields), otherwise React re-hydrates loudly.
    const { start, end } = initialHash.current;
    if (start) setStartPlace(start);
    if (end) setEndPlace(end);
    const map = new MlMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [initialView.lon, initialView.lat],
      zoom: initialView.zoom,
      hash: false,
      attributionControl: false,
    });
    mapRef.current = map;
    // Debug/testing hook: lets headless probes query the live map.
    (window as unknown as { __mapsApp?: MlMap }).__mapsApp = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new GeolocateControl({ trackUserLocation: false }), "bottom-right");

    // Mirror the full state into the hash without flooding history. Endpoints
    // are read through a ref so the moveend handler never goes stale.
    let replace = true;
    map.on("moveend", () => {
      const { start, end } = endpointsRef.current;
      const hash = encodeState(
        { zoom: map.getZoom(), lat: map.getCenter().lat, lon: map.getCenter().lng },
        start,
        end,
      );
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

  // Mirror the chosen endpoints for the hash-writing moveend handler.
  const endpointsRef = React.useRef<{ start: Endpoint | null; end: Endpoint | null }>({ start: null, end: null });
  React.useEffect(() => {
    endpointsRef.current = { start: startPlace, end: endPlace };
  }, [startPlace, endPlace]);

  const copyView = React.useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  }, []);

  const choose = React.useCallback(
    (field: "start" | "end", place: { name: string; lat: number; lon: number }) => {
      if (field === "start") {
        setStartPlace(place);
        setStartQuery("");
        // The natural next step is the destination — focus it right away.
        requestAnimationFrame(() => toInputRef.current?.focus());
      } else {
        setEndPlace(place);
      }
      setResults(null);
    },
    [],
  );

  /** A pick from search or a category list fills the field being edited. */
  const pick = React.useCallback(
    (place: { name: string; lat: number; lon: number }) => {
      const field =
        activeField === "end" || startPlace ? (startPlace && activeField === "start" ? "end" : activeField) : "start";
      choose(field, place);
      const map = mapRef.current;
      if (map && !(startPlace && endPlace)) {
        map.flyTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), 15), speed: 1.4 });
      }
    },
    [activeField, startPlace, endPlace, choose],
  );

  // Endpoint markers on the map: green start, red destination.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = (ref: React.RefObject<Marker | null>, p: Endpoint | null, color: string) => {
      ref.current?.remove();
      ref.current = null;
      if (p) ref.current = new Marker({ color }).setLngLat([p.lon, p.lat]).addTo(map);
    };
    place(startMarkerRef, startPlace, "#2f9e44");
    place(endMarkerRef, endPlace, "#e15b64");
  }, [startPlace, endPlace]);

  // Re-route (or drop the line) whenever the endpoints change.
  React.useEffect(() => {
    if (!startPlace || !endPlace) {
      setRoute(null);
      setRouteState("idle");
      return;
    }
    const controller = new AbortController();
    setRouteState("loading");
    fetchRoute(startPlace, endPlace, controller.signal)
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
  }, [startPlace, endPlace]);

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
  }, [route]);

  // Category search reads the POI features already loaded in the viewport.
  const runCategoryQuery = React.useCallback(() => {
    const map = mapRef.current;
    const category = categoryId ? categoryById(categoryId) : undefined;
    if (!map || !category) {
      setCategoryHits(null);
      return;
    }
    const center = { lat: map.getCenter().lat, lon: map.getCenter().lng };
    const raw: RawPoiFeature[] = [];
    for (const [sourceId, source] of Object.entries(map.getStyle().sources ?? {})) {
      if ((source as { type?: string }).type !== "vector") continue;
      for (const sourceLayer of POI_SOURCE_LAYERS) {
        try {
          const found = map.querySourceFeatures(sourceId, { sourceLayer });
          for (const item of found) {
            const coords = item.geometry && item.geometry.type === "Point" ? item.geometry.coordinates : undefined;
            if (!coords) continue;
            raw.push({ properties: item.properties, geometry: { coordinates: coords } });
          }
        } catch {
          // Layer absent from this schema — fine.
        }
      }
    }
    const hits = collectPois(raw, category, center);
    setCategoryHits((previous) => {
      // Same hits → keep the previous array so effects don't re-run and the
      // dots don't blink (idle fires after every render, including our own).
      const signature = hits.map((hit) => `${hit.name},${hit.lat},${hit.lon}`).join("|");
      if (previous && previous.map((hit) => `${hit.name},${hit.lat},${hit.lon}`).join("|") === signature) return previous;
      return hits;
    });
  }, [categoryId]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    runCategoryQuery();
    if (!categoryId) return;
    // Tiles stream in after every move; re-scan once they settle.
    const onIdle = () => runCategoryQuery();
    map.on("moveend", onIdle);
    map.on("idle", onIdle);
    return () => {
      map.off("moveend", onIdle);
      map.off("idle", onIdle);
    };
  }, [categoryId, runCategoryQuery]);

  // Highlight the category hits on the map: small dots plus name labels. The
  // source is created once and then updated via setData, so the points don't
  // blink on every re-scan after a map move.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!categoryId || !categoryHits || categoryHits.length === 0) {
        if (map.getLayer("category-labels")) map.removeLayer("category-labels");
        if (map.getLayer("category-points")) map.removeLayer("category-points");
        if (map.getSource("category")) map.removeSource("category");
        return;
      }
      const data: FeatureCollection = {
        type: "FeatureCollection",
        features: categoryHits.map((hit) => ({
          type: "Feature",
          properties: { name: hit.name },
          geometry: { type: "Point", coordinates: [hit.lon, hit.lat] },
        })),
      };
      // Source already exists → swap the data in place (no layer flash).
      if (map.getSource("category")) {
        (map.getSource("category") as GeoJSONSource).setData(data);
        return;
      }
      map.addSource("category", { type: "geojson", data });
      map.addLayer({
        id: "category-points",
        type: "circle",
        source: "category",
        paint: {
          "circle-radius": 5,
          "circle-color": "#e15b64",
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      if (map.getStyle().glyphs) {
        map.addLayer({
          id: "category-labels",
          type: "symbol",
          source: "category",
          layout: {
            "text-field": "{name}",
            "text-size": 11,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#3a3335",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.4,
          },
        });
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("styledata", apply);
      return () => {
        map.off("styledata", apply);
      };
    }
  }, [categoryHits, categoryId]);

  // Debounced search for whichever field is being edited, biased to the map center.
  const query = activeField === "start" ? startQuery : endQuery;
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

  const field = (which: "start" | "end") => ({
    place: which === "start" ? startPlace : endPlace,
    text: which === "start" ? startQuery : endQuery,
    setText: which === "start" ? setStartQuery : setEndQuery,
  });

  /** Typing into a field invalidates its chosen place. */
  const editField = (which: "start" | "end", text: string) => {
    if (which === "start") {
      if (startPlace) setStartPlace(null);
      setStartQuery(text);
    } else {
      if (endPlace) setEndPlace(null);
      setEndQuery(text);
    }
    setActiveField(which);
    setRoute(null);
    setRouteState("idle");
  };

  const clearField = (which: "start" | "end") => {
    if (which === "start") {
      setStartPlace(null);
      setStartQuery("");
    } else {
      setEndPlace(null);
      setEndQuery("");
    }
    setResults(null);
  };

  const swap = React.useCallback(() => {
    setStartPlace(endPlace);
    setEndPlace(startPlace);
    setStartQuery("");
    setEndQuery("");
  }, [startPlace, endPlace]);

  const clearRoute = React.useCallback(() => {
    setStartPlace(null);
    setEndPlace(null);
    setStartQuery("");
    setEndQuery("");
    setResults(null);
  }, []);

  const renderField = (which: "start" | "end") => {
    const { place, text } = field(which);
    const isActive = activeField === which;
    const listId = `maps-${which}-list`;
    return (
      <div className="relative flex-1">
        <label className="sr-only" htmlFor={`maps-${which}`}>
          {t(which === "start" ? "fromLabel" : "toLabel")}
        </label>
        <input
          id={`maps-${which}`}
          ref={which === "end" ? toInputRef : undefined}
          type="text"
          className={inputClass}
          placeholder={t(which === "start" ? "fromPlaceholder" : "toPlaceholder")}
          value={place ? place.name : text}
          onChange={(event) => editField(which, event.target.value)}
          onFocus={() => setActiveField(which)}
          role="combobox"
          aria-expanded={isActive && results !== null}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {(place || text) && (
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-sm text-(--muted-fg) hover:text-(--fg)"
            onClick={() => clearField(which)}
            aria-label={t("clearField")}
          >
            ✕
          </button>
        )}
        {isActive && results !== null && results.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute top-full right-0 left-0 z-10 max-h-80 overflow-y-auto rounded-md border border-(--border) bg-(--surface) shadow-lg"
          >
            {results.map((place2) => (
              <li key={place2.key} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={place2.lat === place?.lat && place2.lon === place?.lon}
                  className="block w-full px-3 py-2 text-left hover:bg-(--accent)/10 focus-visible:bg-(--accent)/10"
                  onClick={() => pick(place2)}
                >
                  <span className="block text-sm text-(--fg)">{place2.name}</span>
                  {place2.detail && <span className="block text-xs text-(--muted-fg)">{place2.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <ToolPage title={t("title")} tagline={t("tagline")} wide fill>
      <div
        className="flex min-h-0 flex-1 flex-col gap-3"
        style={{ paddingBottom: dockOffset || undefined }}
      >
        {/* The route block: above the map on desktop, docked to the bottom of
            the screen on phones (see .maps-route-dock in apps.css). */}
        <div ref={dockRef} className="maps-route-dock flex flex-col gap-3">
          <div className="flex items-start gap-2">
          {/* The route block: a connector rail joining the two endpoint fields. */}
          <div className="relative min-w-0 flex-1">
            <div aria-hidden className="absolute top-[26px] bottom-[26px] left-[15px] w-px bg-(--border)" />
            <div
              aria-hidden
              className="absolute top-[13px] left-[9px] h-[14px] w-[14px] rounded-full border-2 border-(--fg) bg-(--surface)"
            />
            <div
              aria-hidden
              className="absolute bottom-[13px] left-[9px] h-[14px] w-[14px] rounded-full border-2 border-(--accent) bg-(--surface)"
            />
            <button
              type="button"
              className="absolute top-1/2 right-3 z-10 flex h-[28px] w-[28px] -translate-y-1/2 items-center justify-center rounded-full border border-(--border) bg-(--surface) text-(--muted-fg) hover:text-(--fg)"
              onClick={swap}
              disabled={!startPlace && !endPlace}
              aria-label={t("swap")}
              title={t("swap")}
            >
              <ArrowUpDown size={14} />
            </button>
            <div className="flex flex-col gap-2 pl-10">
              {renderField("start")}
              {renderField("end")}
            </div>
          </div>
          <button
            type="button"
            className="h-[38px] rounded-md border border-(--border) px-3 py-2 text-sm text-(--fg)"
            onClick={copyView}
            aria-label={t("hashCopied")}
            title={t("hashCopied")}
          >
            {copied ? "✓" : "🔗"}
          </button>
          </div>

          {/* Status + summary, indented to align with the fields, not the rail. */}
          <div className="flex flex-wrap items-center gap-2 pl-10">
            <p aria-live="polite" className="min-h-5 text-xs text-(--muted-fg)">
              {status === "searching" ? t("searching") : ""}
              {status === "failed" ? t("searchFailed") : ""}
              {results && results.length === 0 && status === "idle" ? t("noResults") : ""}
              {startPlace && endPlace && routeState === "loading" ? t("routing") : ""}
              {startPlace && endPlace && routeState === "failed" ? t("routeFailed") : ""}
              {startPlace && endPlace && route ? `${t("routeSummary")}: ${formatRoute(route.distance, route.duration, lang)}` : ""}
            </p>
            {startPlace && endPlace && (
              <button
                type="button"
                className="rounded-md border border-(--border) px-2 py-1 text-xs text-(--muted-fg) hover:text-(--fg)"
                onClick={clearRoute}
              >
                {t("routeClear")}
              </button>
            )}
          </div>
          <p className="hidden max-sm:block text-[10px] text-(--muted-fg)">{t("attribution")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("categoriesLabel")}>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              className={`rounded-full border px-2.5 py-1 text-xs ${categoryId === category.id ? "border-(--accent) bg-(--accent) text-white" : "border-(--border) text-(--muted-fg) hover:text-(--fg)"}`}
              onClick={() => setCategoryId((current) => (current === category.id ? null : category.id))}
            >
              {category.icon} {t(`category_${category.id}` as Parameters<typeof mb>[1])}
            </button>
          ))}
        </div>

        {categoryHits && categoryHits.length > 0 && (
          <ul className="max-h-40 overflow-y-auto rounded-md border border-(--border) bg-(--surface) text-sm">
            {categoryHits.map((hit) => (
              <li key={`${hit.name}-${hit.lat}-${hit.lon}`}>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-(--accent)/10 focus-visible:bg-(--accent)/10"
                  onClick={() => pick(hit)}
                >
                  {hit.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          ref={containerRef}
          className="maps-map min-h-[55vh] max-sm:min-h-0 flex-1 overflow-hidden rounded-xl border border-(--border)"
          role="application"
          aria-label={t("map")}
        />
        <p className="max-sm:hidden text-xs text-(--muted-fg)">{t("attribution")}</p>
      </div>
    </ToolPage>
  );
}
