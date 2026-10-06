// Copies the PDF.js runtime files the viewer fetches on demand (CMaps, standard
// fonts, ICC profiles and WASM image decoders) into assets/pdfjs, which Astro
// serves as static files. They are generated, not committed (see .gitignore).
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = `${root}node_modules/pdfjs-dist`;
const target = `${root}assets/pdfjs`;

if (!existsSync(source)) {
  console.warn("pdfjs-dist is not installed; skipping asset copy.");
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await mkdir(`${target}/wasm`, { recursive: true });

for (const dir of ["cmaps", "standard_fonts", "iccs"]) {
  await cp(`${source}/${dir}`, `${target}/${dir}`, { recursive: true });
}
for (const file of ["openjpeg.wasm", "jbig2.wasm", "qcms_bg.wasm"]) {
  await cp(`${source}/wasm/${file}`, `${target}/wasm/${file}`);
}
console.log("Copied PDF.js assets to assets/pdfjs");
