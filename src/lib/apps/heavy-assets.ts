/**
 * The lazy heavy-asset pattern: files too big to precache (an OCR engine, language
 * data) are downloaded when the user asks, with progress, into a cache of their
 * own that can be inspected and emptied. The service worker answers any request
 * from every cache, so once a file is here the page and its web workers get it
 * without the network.
 */

export interface HeavyFile {
  url: string;
  /** Bytes, as the manifest says; used for honest labels and for the progress total. */
  size: number;
}

export interface HeavyDeps {
  caches?: Pick<CacheStorage, "open" | "delete">;
  fetch?: typeof fetch;
}

export interface DownloadProgress {
  /** Bytes received so far, across every file. */
  loaded: number;
  total: number;
  /** The file being fetched now. */
  url: string;
}

export const OCR_CACHE = "lab-ocr-v1";

const depsOf = (deps: HeavyDeps): { caches: HeavyDeps["caches"]; fetch: typeof fetch } => ({
  caches: deps.caches ?? (typeof caches === "undefined" ? undefined : caches),
  fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
});

/** Is Cache Storage available at all (it is not in some private modes, or on plain http)? */
export const cacheSupported = (deps: HeavyDeps = {}): boolean => depsOf(deps).caches !== undefined;

/** Which of the files are already downloaded. */
export async function cachedFiles(files: readonly HeavyFile[], cacheName = OCR_CACHE, deps: HeavyDeps = {}): Promise<Set<string>> {
  const { caches: store } = depsOf(deps);
  const found = new Set<string>();
  if (!store) return found;
  try {
    const cache = await store.open(cacheName);
    await Promise.all(
      files.map(async (file) => {
        if (await cache.match(file.url)) found.add(file.url);
      }),
    );
  } catch {
    // An unreadable cache is an empty one.
  }
  return found;
}

export const totalSize = (files: readonly HeavyFile[]): number => files.reduce((sum, file) => sum + file.size, 0);

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  cacheName?: string;
  deps?: HeavyDeps;
}

/**
 * Download the files that are not cached yet, one at a time, reporting bytes as they
 * arrive. A file is stored only once it is complete, so cancelling or losing the
 * connection never leaves half a file behind.
 */
export async function downloadFiles(files: readonly HeavyFile[], options: DownloadOptions = {}): Promise<void> {
  const { onProgress, signal, cacheName = OCR_CACHE } = options;
  const { caches: store, fetch: doFetch } = depsOf(options.deps ?? {});
  if (!store) throw new Error("Cache Storage is not available.");
  const cache = await store.open(cacheName);
  const have = await cachedFiles(files, cacheName, options.deps);
  const wanted = files.filter((file) => !have.has(file.url));
  const total = totalSize(wanted);
  let loaded = 0;

  for (const file of wanted) {
    const response = await doFetch(file.url, { signal, cache: "reload" });
    if (!response.ok) throw new Error(`${file.url}: ${response.status}`);
    const parts: Uint8Array[] = [];
    const reader = response.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.byteLength;
        onProgress?.({ loaded: Math.min(loaded, total), total, url: file.url });
      }
    } else {
      // No streaming: take it whole.
      const bytes = new Uint8Array(await response.arrayBuffer());
      parts.push(bytes);
      loaded += bytes.byteLength;
      onProgress?.({ loaded: Math.min(loaded, total), total, url: file.url });
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await cache.put(
      file.url,
      new Response(new Blob(parts as BlobPart[]), { status: 200, headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream" } }),
    );
  }
}

/** Remove downloaded files; true if any were there. */
export async function removeFiles(files: readonly HeavyFile[], cacheName = OCR_CACHE, deps: HeavyDeps = {}): Promise<boolean> {
  const { caches: store } = depsOf(deps);
  if (!store) return false;
  let removed = false;
  try {
    const cache = await store.open(cacheName);
    for (const file of files) if (await cache.delete(file.url)) removed = true;
  } catch {
    // Nothing to remove.
  }
  return removed;
}
