import { describe, expect, it, vi } from "vitest";

import { OCR_CACHE, cacheSupported, cachedFiles, downloadFiles, removeFiles, totalSize, type HeavyFile } from "@/lib/apps/heavy-assets";

/** An in-memory CacheStorage, enough for the helper. */
function memoryCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (url: string) => store.get(url)?.clone(),
      put: async (url: string, response: Response) => void store.set(url, response),
      delete: async (url: string) => store.delete(url),
    };
  };
  return { stores, caches: { open, delete: async (name: string) => stores.delete(name) } as unknown as CacheStorage };
}

/** A fetch that streams a body in chunks and records what was asked for. */
function streamingFetch(bodies: Record<string, number[]>, status = 200) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const chunks = bodies[url];
    if (!chunks || status !== 200) return new Response("nope", { status: status === 200 ? 404 : status });
    let at = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= chunks.length) return controller.close();
        controller.enqueue(new Uint8Array(chunks[at++]!).fill(7));
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "application/gzip" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const A: HeavyFile = { url: "https://x.test/ocr/a.bin", size: 300 };
const B: HeavyFile = { url: "https://x.test/ocr/b.bin", size: 100 };

describe("heavy assets", () => {
  it("names the cache for OCR and adds sizes up", () => {
    expect(OCR_CACHE).toBe("lab-ocr-v1");
    expect(totalSize([A, B])).toBe(400);
    expect(totalSize([])).toBe(0);
  });

  it("reports which files are downloaded", async () => {
    const { caches, stores } = memoryCaches();
    expect([...(await cachedFiles([A, B], OCR_CACHE, { caches }))]).toEqual([]);
    stores.set(OCR_CACHE, new Map([[A.url, new Response("x")]]));
    expect([...(await cachedFiles([A, B], OCR_CACHE, { caches }))]).toEqual([A.url]);
  });

  it("downloads missing files, reporting progress across all of them, and stores each whole", async () => {
    const { caches, stores } = memoryCaches();
    const { fetchImpl, calls } = streamingFetch({ [A.url]: [100, 100, 100], [B.url]: [100] });
    const progress: number[] = [];
    await downloadFiles([A, B], { deps: { caches, fetch: fetchImpl }, onProgress: (p) => progress.push(p.loaded) });
    expect(calls).toEqual([A.url, B.url]);
    expect(progress).toEqual([100, 200, 300, 400]);
    const stored = stores.get(OCR_CACHE)!;
    expect(stored.size).toBe(2);
    expect((await stored.get(A.url)!.arrayBuffer()).byteLength).toBe(300);
    expect(stored.get(A.url)!.headers.get("Content-Type")).toBe("application/gzip");
  });

  it("skips what it already has, and counts progress only over what it fetches", async () => {
    const { caches, stores } = memoryCaches();
    stores.set(OCR_CACHE, new Map([[A.url, new Response("already")]]));
    const { fetchImpl, calls } = streamingFetch({ [B.url]: [60, 40] });
    const seen: { loaded: number; total: number }[] = [];
    await downloadFiles([A, B], { deps: { caches, fetch: fetchImpl }, onProgress: (p) => seen.push({ loaded: p.loaded, total: p.total }) });
    expect(calls).toEqual([B.url]);
    expect(seen).toEqual([{ loaded: 60, total: 100 }, { loaded: 100, total: 100 }]);
  });

  it("never reports more than the total, even when a file is bigger than the manifest said", async () => {
    const { caches } = memoryCaches();
    const { fetchImpl } = streamingFetch({ [B.url]: [150] });
    const seen: number[] = [];
    await downloadFiles([B], { deps: { caches, fetch: fetchImpl }, onProgress: (p) => seen.push(p.loaded) });
    expect(seen).toEqual([100]);
  });

  it("stores nothing for a file that fails, and says so", async () => {
    const { caches, stores } = memoryCaches();
    const { fetchImpl } = streamingFetch({}, 500);
    await expect(downloadFiles([A], { deps: { caches, fetch: fetchImpl } })).rejects.toThrow(/500/);
    expect(stores.get(OCR_CACHE)?.size ?? 0).toBe(0);
  });

  it("keeps the files it finished when a later one fails", async () => {
    const { caches, stores } = memoryCaches();
    const { fetchImpl } = streamingFetch({ [A.url]: [300] });
    await expect(downloadFiles([A, B], { deps: { caches, fetch: fetchImpl } })).rejects.toThrow();
    expect([...stores.get(OCR_CACHE)!.keys()]).toEqual([A.url]);
  });

  it("stops when cancelled, without storing a half file", async () => {
    const { caches, stores } = memoryCaches();
    const controller = new AbortController();
    const { fetchImpl } = streamingFetch({ [A.url]: [100, 100, 100] });
    await expect(
      downloadFiles([A], { signal: controller.signal, deps: { caches, fetch: fetchImpl }, onProgress: () => controller.abort() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(stores.get(OCR_CACHE)?.size ?? 0).toBe(0);
  });

  it("works when the response cannot be streamed", async () => {
    const { caches, stores } = memoryCaches();
    const plain = vi.fn(async () => ({ ok: true, status: 200, body: null, headers: new Headers(), arrayBuffer: async () => new Uint8Array(50).buffer }) as unknown as Response);
    await downloadFiles([{ url: "u", size: 50 }], { deps: { caches, fetch: plain as unknown as typeof fetch } });
    expect(stores.get(OCR_CACHE)!.has("u")).toBe(true);
  });

  it("removes downloaded files and says whether any were there", async () => {
    const { caches, stores } = memoryCaches();
    stores.set(OCR_CACHE, new Map([[A.url, new Response("x")], [B.url, new Response("y")]]));
    expect(await removeFiles([A], OCR_CACHE, { caches })).toBe(true);
    expect([...stores.get(OCR_CACHE)!.keys()]).toEqual([B.url]);
    expect(await removeFiles([A], OCR_CACHE, { caches })).toBe(false);
  });

  it("copes with no Cache Storage at all", async () => {
    expect(cacheSupported({ caches: undefined, fetch: globalThis.fetch })).toBe(typeof caches !== "undefined");
    const none = { caches: undefined } as never;
    expect(await removeFiles([A], OCR_CACHE, none)).toBe(typeof caches === "undefined" ? false : expect.anything());
  });

  it("treats an unreadable cache as empty", async () => {
    const broken = { open: async () => { throw new Error("denied"); }, delete: async () => false } as unknown as CacheStorage;
    expect([...(await cachedFiles([A], OCR_CACHE, { caches: broken }))]).toEqual([]);
    expect(await removeFiles([A], OCR_CACHE, { caches: broken })).toBe(false);
  });
});
