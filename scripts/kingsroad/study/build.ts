// From the repo root: node --experimental-strip-types scripts/kingsroad/study/build.ts /tmp/kingsroad-study.mjs
import { build } from "esbuild";
import { resolve } from "node:path";
import { isVariant } from "./variant.ts";
import { studyPlugin } from "./instrument.ts";
const outfile = process.argv[2] ?? "/tmp/kingsroad-study.mjs";
if (!outfile.endsWith(".mjs")) throw new Error("Study output must end in .mjs");
const variant = process.argv[3] ?? "baseline";
if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
await build({ entryPoints: ["scripts/kingsroad/study/cli.ts"], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin(process.cwd(), variant)] });

await build({ entryPoints: ["scripts/kingsroad/study/summarize.ts"], outfile: outfile.replace(/\.mjs$/, "-summarize.mjs"), bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") } });
await build({ entryPoints: ["scripts/kingsroad/study/compare-cli.ts"], outfile: outfile.replace(/\.mjs$/, "-compare.mjs"), bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") } });
