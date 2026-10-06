/*
 * Generates the service worker. It is a build artefact (dist/sw.js) because the
 * precache list contains fingerprinted file names that only exist after the build.
 *
 * Strategy, chosen for a static site on a host we cannot configure headers on
 * (GitHub Pages caches every file for ~10 minutes):
 *   - Every page, script and stylesheet is precached under a versioned cache,
 *     so the whole app works offline after the first visit and every page of one
 *     version is always served together with that version's assets.
 *   - A new deploy installs a new worker in the background; it only takes over
 *     when the visitor accepts the "new version" prompt (message SKIP_WAITING),
 *     so a page is never half old / half new.
 *   - Large optional data (PDF.js fonts, CMaps, WASM) is cached on first use.
 */

export function renderServiceWorker({ version, base, assets }) {
  return `/* lab service worker — generated at build time, do not edit. */
const VERSION = ${JSON.stringify(version)};
const BASE = ${JSON.stringify(base)};
const PRECACHE = "lab-precache-" + VERSION;
const RUNTIME = "lab-runtime-v1";
const ASSETS = ${JSON.stringify(assets)};
// Servers differ in the Vary header they send (e.g. "Origin" for module scripts);
// the files are versioned, so a Vary mismatch must never cause a cache miss.
const MATCH = { ignoreSearch: true, ignoreVary: true };
const RUNTIME_PREFIXES = [BASE + "pdfjs/", BASE + "_astro/"];

self.addEventListener("install", (event) => {
  // addAll is atomic: if any file fails the install fails and the previous
  // worker (and its complete cache) keeps serving.
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("lab-precache-") && key !== PRECACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith(request.mode === "navigate" ? navigate(request, url) : asset(request));
});

function navigationCandidates(url) {
  const path = url.pathname;
  const list = [path];
  if (!/\\.[a-z0-9]+$/i.test(path) && !path.endsWith("/")) list.push(path + "/");
  if (path.endsWith("/")) list.push(path + "index.html");
  return list;
}

async function navigate(request, url) {
  const cache = await caches.open(PRECACHE);
  for (const candidate of navigationCandidates(url)) {
    const hit = await cache.match(candidate, MATCH);
    if (hit) return hit;
  }
  try {
    return await fetch(request);
  } catch (error) {
    // Offline and never visited: fall back to the tools index.
    return (await cache.match(BASE, MATCH)) || Response.error();
  }
}

async function asset(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const path = new URL(request.url).pathname;
    if (response.ok && RUNTIME_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return Response.error();
  }
}
`;
}
