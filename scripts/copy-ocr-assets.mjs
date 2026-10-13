// Copies the OCR engine and its language data into assets/ocr, which Astro serves
// as static files. They are generated, not committed (see .gitignore), and are
// never precached by the service worker: the OCR tool downloads them on request
// into their own cache, and shows their real sizes from the manifest written here.
//
//   worker.min.js                          the tesseract.js web worker (~130 KB)
//   core/tesseract-core-simd-lstm.wasm.js  the engine, with SIMD (~3.9 MB)
//   core/tesseract-core-lstm.wasm.js       the engine, without SIMD (~3.9 MB)
//   lang/<code>.traineddata.gz             integer-quantised "best" models (~3 MB each)
//
// Only the English and Russian models ship; the manifest lists whatever is here, so
// adding a language is dropping its file in and naming it in LANGUAGES below.
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = `${root}assets/ocr`;
const engine = `${root}node_modules/tesseract.js`;
const core = `${root}node_modules/tesseract.js-core`;
const data = (code) => `${root}node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`;

const LANGUAGES = ["eng", "rus"];

if (!existsSync(engine) || !existsSync(core)) {
  console.warn("tesseract.js is not installed; skipping OCR asset copy.");
  process.exit(0);
}

const copies = [
  { to: "worker.min.js", from: `${engine}/dist/worker.min.js` },
  { to: "core/tesseract-core-simd-lstm.wasm.js", from: `${core}/tesseract-core-simd-lstm.wasm.js` },
  { to: "core/tesseract-core-lstm.wasm.js", from: `${core}/tesseract-core-lstm.wasm.js` },
  ...LANGUAGES.filter((code) => existsSync(data(code))).map((code) => ({ to: `lang/${code}.traineddata.gz`, from: data(code) })),
];

await rm(target, { recursive: true, force: true });
await mkdir(`${target}/core`, { recursive: true });
await mkdir(`${target}/lang`, { recursive: true });

const sizes = {};
for (const { from, to } of copies) {
  await cp(from, `${target}/${to}`);
  sizes[to] = (await stat(`${target}/${to}`)).size;
}

const version = JSON.parse(await readFile(`${engine}/package.json`, "utf8")).version;
const file = (path) => ({ path, size: sizes[path] });
const manifest = {
  version,
  worker: file("worker.min.js"),
  cores: { simd: file("core/tesseract-core-simd-lstm.wasm.js"), baseline: file("core/tesseract-core-lstm.wasm.js") },
  languages: LANGUAGES.filter((code) => sizes[`lang/${code}.traineddata.gz`] !== undefined).map((code) => ({ code, ...file(`lang/${code}.traineddata.gz`) })),
};
await writeFile(`${target}/manifest.json`, JSON.stringify(manifest, null, 2));

// The licences travel with the files they cover (Apache-2.0).
await writeFile(
  `${target}/LICENSES.txt`,
  "Tesseract OCR engine, tesseract.js and the language data are licensed under the Apache License 2.0.\n" +
    "https://github.com/naptha/tesseract.js  https://github.com/naptha/tesseract.js-core  https://github.com/tesseract-ocr/tessdata_best\n",
);
console.log(`Copied OCR assets to assets/ocr (${Object.values(sizes).reduce((a, b) => a + b, 0) / 1024 / 1024 | 0} MB, ${manifest.languages.length} languages)`);
