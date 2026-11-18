import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { urlFor } from "../../scripts/pwa/integration.mjs";
import { renderServiceWorker } from "../../scripts/pwa/sw-source.mjs";

/** A tiny in-memory Cache API: just enough to run the worker's logic. */
function createCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (input: string | Request) => new URL(typeof input === "string" ? input : input.url, "https://site.test").href;
  const stripSearch = (href: string) => href.split("?")[0]!;

  const makeCache = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    const find = (input: string | Request, options?: { ignoreSearch?: boolean }) => {
      const wanted = keyOf(input);
      for (const [key, response] of store) {
        if (key === wanted || (options?.ignoreSearch && stripSearch(key) === stripSearch(wanted))) return response.clone();
      }
      return undefined;
    };
    return {
      find,
      async match(input: string | Request, options?: { ignoreSearch?: boolean }) {
        return find(input, options);
      },
      async put(input: string | Request, response: Response) {
        store.set(keyOf(input), response);
      },
      async addAll(requests: Request[]) {
        const fetched = await Promise.all(requests.map((request) => fetchMock(request)));
        fetched.forEach((response, index) => {
          if (!response.ok) throw new TypeError("addAll: bad response");
          store.set(keyOf(requests[index]!), response);
        });
      },
      async keys() {
        return [...store.keys()].map((key) => new Request(key));
      },
    };
  };

  const caches = {
    stores,
    async open(name: string) {
      return makeCache(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(input: string | Request, options?: { ignoreSearch?: boolean }) {
      for (const name of stores.keys()) {
        const hit = await makeCache(name).match(input, options);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  return caches;
}

let fetchMock: (request: Request | string) => Promise<Response>;

/** Browsers resolve relative URLs against the worker's location; Node does not. */
class SiteRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, "https://site.test").href : input, init);
  }
}

const ASSETS = ["/lab/", "/lab/index.html", "/lab/viewer/", "/lab/viewer/index.html", "/lab/_astro/app.abc.js", "/lab/favicon.svg"];

function boot(options: { online?: boolean } = {}) {
  const listeners: Record<string, (event: any) => void> = {};
  const caches = createCaches();
  let online = options.online ?? true;
  const requested: string[] = [];
  fetchMock = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    requested.push(new URL(url, "https://site.test").pathname);
    if (!online) throw new TypeError("offline");
    if (url.includes("missing")) return new Response("nope", { status: 404 });
    return new Response(`body of ${new URL(url, "https://site.test").pathname}`, { status: 200 });
  };
  const self = {
    location: { origin: "https://site.test" },
    addEventListener: (type: string, fn: (event: any) => void) => (listeners[type] = fn),
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
  };
  const source = renderServiceWorker({ version: "v1", base: "/lab/", assets: ASSETS });
  new Function("self", "caches", "fetch", "Request", "Response", "URL", source)(self, caches, (input: Request | string) => fetchMock(input), SiteRequest, Response, URL);

  const dispatch = async (type: string, init: Record<string, unknown> = {}) => {
    let pending: Promise<unknown> = Promise.resolve();
    let responded: Promise<Response> | undefined;
    listeners[type]!({ ...init, waitUntil: (promise: Promise<unknown>) => (pending = promise), respondWith: (promise: Promise<Response>) => (responded = promise) });
    await pending;
    return responded ? await responded : undefined;
  };

  const request = (url: string, extra: { method?: string; mode?: string } = {}) => {
    const req = new Request(`https://site.test${url}`, { method: extra.method ?? "GET" });
    Object.defineProperty(req, "mode", { value: extra.mode ?? "no-cors" });
    return req;
  };

  return { caches, self, dispatch, request, requested, setOnline: (value: boolean) => (online = value), listeners };
}

describe("service worker", () => {
  it("precaches every listed file under a versioned cache on install", async () => {
    const worker = boot();
    await worker.dispatch("install");
    expect([...worker.caches.stores.keys()]).toEqual(["lab-precache-v1"]);
    expect(worker.caches.stores.get("lab-precache-v1")!.size).toBe(ASSETS.length);
  });

  it("fails the install atomically when a file cannot be fetched", async () => {
    const worker = boot();
    const original = fetchMock;
    fetchMock = async (input) => (String(typeof input === "string" ? input : input.url).includes("app.abc") ? new Response("", { status: 500 }) : original(input));
    await expect(worker.dispatch("install")).rejects.toThrow();
  });

  it("drops old precaches on activate but keeps the runtime cache, then claims clients", async () => {
    const worker = boot();
    await worker.caches.open("lab-precache-old");
    await worker.caches.open("lab-runtime-v1");
    await worker.caches.open("somebody-elses-cache");
    await worker.dispatch("install");
    await worker.dispatch("activate");
    const names = await worker.caches.keys();
    expect(names.sort()).toEqual(["lab-precache-v1", "lab-runtime-v1", "somebody-elses-cache"]);
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it("only skips waiting when the page asks for it", async () => {
    const worker = boot();
    await worker.dispatch("message", { data: "hello" });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    await worker.dispatch("message", { data: "SKIP_WAITING" });
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("serves pages from the precache — with or without a trailing slash, ignoring the query", async () => {
    const worker = boot();
    await worker.dispatch("install");
    worker.setOnline(false);
    const expectations: [string, string][] = [
      ["/lab/viewer/", "body of /lab/viewer/"],
      ["/lab/viewer", "body of /lab/viewer/"],
      ["/lab/viewer/?utm=1", "body of /lab/viewer/"],
      ["/lab/", "body of /lab/"],
    ];
    for (const [url, expected] of expectations) {
      const response = await worker.dispatch("fetch", { request: worker.request(url, { mode: "navigate" }) });
      expect(await response!.text(), url).toBe(expected);
    }
  });

  it("falls back to the tools index when an unknown page is requested offline", async () => {
    const worker = boot();
    await worker.dispatch("install");
    worker.setOnline(false);
    const response = await worker.dispatch("fetch", { request: worker.request("/lab/never-visited/", { mode: "navigate" }) });
    expect(await response!.text()).toBe("body of /lab/");
  });

  it("goes to the network for unknown pages when online", async () => {
    const worker = boot();
    await worker.dispatch("install");
    worker.requested.length = 0;
    const response = await worker.dispatch("fetch", { request: worker.request("/lab/new-page/", { mode: "navigate" }) });
    expect(await response!.text()).toBe("body of /lab/new-page/");
    expect(worker.requested).toEqual(["/lab/new-page/"]);
  });

  it("serves precached assets without touching the network", async () => {
    const worker = boot();
    await worker.dispatch("install");
    worker.requested.length = 0;
    const response = await worker.dispatch("fetch", { request: worker.request("/lab/_astro/app.abc.js") });
    expect(await response!.text()).toBe("body of /lab/_astro/app.abc.js");
    expect(worker.requested).toEqual([]);
  });

  it("caches on-demand PDF.js data the first time it is used, and only that kind of file", async () => {
    const worker = boot();
    await worker.dispatch("install");
    await worker.dispatch("fetch", { request: worker.request("/lab/pdfjs/wasm/openjpeg.wasm") });
    await worker.dispatch("fetch", { request: worker.request("/lab/other.json") });
    const runtime = worker.caches.stores.get("lab-runtime-v1")!;
    expect([...runtime.keys()]).toEqual(["https://site.test/lab/pdfjs/wasm/openjpeg.wasm"]);

    worker.setOnline(false);
    const again = await worker.dispatch("fetch", { request: worker.request("/lab/pdfjs/wasm/openjpeg.wasm") });
    expect(await again!.text()).toBe("body of /lab/pdfjs/wasm/openjpeg.wasm");
    const unknown = await worker.dispatch("fetch", { request: worker.request("/lab/other.json") });
    expect(unknown!.type).toBe("error");
  });

  it("never caches failed responses", async () => {
    const worker = boot();
    await worker.dispatch("install");
    const response = await worker.dispatch("fetch", { request: worker.request("/lab/pdfjs/missing.bin") });
    expect(response!.status).toBe(404);
    expect(worker.caches.stores.get("lab-runtime-v1")).toBeUndefined();
  });

  it("ignores requests it should not touch", async () => {
    const worker = boot();
    await worker.dispatch("install");
    for (const request of [worker.request("/lab/_astro/app.abc.js", { method: "POST" }), worker.request("/other-site/page", { mode: "navigate" }), new Request("https://cdn.test/lab/x.js")]) {
      expect(await worker.dispatch("fetch", { request })).toBeUndefined();
    }
  });
});

describe("build helpers", () => {
  it("maps built files to the URLs they are served at", () => {
    expect(urlFor("/lab/", "index.html")).toBe("/lab/");
    expect(urlFor("/lab/", "viewer/index.html")).toBe("/lab/viewer/");
    expect(urlFor("/lab/", "_astro/a.js")).toBe("/lab/_astro/a.js");
    expect(urlFor("/", "icons/icon.png")).toBe("/icons/icon.png");
  });

  it("generates a manifest scoped to the site base with real icon files", async () => {
    const { GET } = await import("../../src/pages/manifest.webmanifest");
    const manifest = await (await GET({} as never)).json();
    expect(manifest).toMatchObject({ display: "standalone", short_name: "Local Lab" });
    // In tests BASE_URL is "/", so scope is the root; the paths stay under it.
    expect(manifest.start_url).toBe(manifest.scope);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(existsSync(new URL(`../../assets${icon.src.replace(/^\/lab/, "")}`, import.meta.url)), icon.src).toBe(true);
    }
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of manifest.shortcuts as { url: string }[]) expect(shortcut.url.endsWith("/")).toBe(true);
  });
});
