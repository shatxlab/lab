/**
 * Receiving side of the Web Share Target (Android installed PWA). The service
 * worker parks shared files and text in the "lab-share" cache; this reads them
 * once and clears the cache. iOS has no share-target support: Safari users add
 * files through the regular picker.
 */

const SHARE_CACHE = "lab-share";

export interface SharedItems {
  files: File[];
  text: string;
}

export async function takeSharedItems(cacheStorage: CacheStorage | undefined = globalThis.caches): Promise<SharedItems> {
  const empty: SharedItems = { files: [], text: "" };
  if (!cacheStorage || !(await cacheStorage.has(SHARE_CACHE))) return empty;
  const cache = await cacheStorage.open(SHARE_CACHE);
  const files: File[] = [];
  let text = "";
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    if (new URL(request.url).pathname === "/shared-text") {
      text = await response.text();
      continue;
    }
    const name = decodeURIComponent(response.headers.get("X-Name") ?? "shared");
    files.push(new File([await response.blob()], name, { type: response.headers.get("Content-Type") ?? "" }));
  }
  await cacheStorage.delete(SHARE_CACHE);
  return { files, text };
}
