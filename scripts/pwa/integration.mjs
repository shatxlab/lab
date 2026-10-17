import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { renderServiceWorker } from "./sw-source.mjs";

/**
 * Files that are never precached: the worker itself, host config and bulky
 * on-demand data. PDF.js's standard fonts and colour profiles are small and
 * needed by simple PDFs, so they ARE precached; its CMaps and WASM decoders
 * (several MB, rarely needed) are cached the first time a document uses them.
 */
const EXCLUDE = [/^sw\.js$/, /^_headers$/, /^\.nojekyll$/, /^pdfjs\/(?!standard_fonts\/|iccs\/)/, /\.map$/];

async function* walk(dir, prefix = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), rel);
    else yield rel;
  }
}

/** Public URL (under `base`) for a built file; `x/index.html` is served as `x/`. */
export function urlFor(base, rel) {
  if (rel === "index.html") return base;
  if (rel.endsWith("/index.html")) return `${base}${rel.slice(0, -"index.html".length)}`;
  return `${base}${rel}`;
}

/**
 * Astro integration: after the build, scan dist/ and write dist/sw.js with a
 * precache list and a version derived from the content of every cached file
 * (so the worker changes exactly when something users would see changes).
 */
export default function pwa() {
  let base = "/";
  return {
    name: "lab-pwa",
    hooks: {
      "astro:config:done": ({ config }) => {
        base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      },
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const hash = createHash("sha256");
        const assets = [];
        for await (const rel of walk(root)) {
          if (EXCLUDE.some((pattern) => pattern.test(rel))) continue;
          const bytes = await readFile(path.join(root, rel));
          hash.update(rel).update(bytes);
          assets.push(urlFor(base, rel));
          // The directory URL and the explicit index.html both resolve offline.
          if (rel.endsWith("/index.html") || rel === "index.html") assets.push(`${base}${rel}`);
        }
        assets.sort();
        // The worker's own logic counts too: changing it must change the cache name.
        hash.update(renderServiceWorker({ version: "", base, assets }));
        const version = hash.digest("hex").slice(0, 12);
        await writeFile(path.join(root, "sw.js"), renderServiceWorker({ version, base, assets }));
        const total = (await Promise.all(assets.map((url) => stat(path.join(root, url.slice(base.length) || "index.html")).then((s) => s.size).catch(() => 0)))).reduce((a, b) => a + b, 0);
        logger.info(`service worker ${version}: precaching ${assets.length} files (${(total / 1024 / 1024).toFixed(1)} MB)`);
      },
    },
  };
}
