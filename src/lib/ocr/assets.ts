/** Where the OCR engine and language data live, and what is needed for a given choice of languages. */

import { withBase } from "@/lib/apps/paths";
import type { HeavyFile } from "@/lib/apps/heavy-assets";

export interface ManifestFile {
  path: string;
  size: number;
}

export interface OcrManifest {
  version: string;
  worker: ManifestFile;
  cores: { simd: ManifestFile; baseline: ManifestFile };
  languages: { code: string; path: string; size: number }[];
}

export const MANIFEST_URL = (): string => withBase("/ocr/manifest.json");
export const assetUrl = (path: string): string => new URL(withBase(`/ocr/${path}`), typeof location === "undefined" ? "http://localhost" : location.href).href;

const isFile = (value: unknown): value is ManifestFile =>
  !!value && typeof value === "object" && typeof (value as ManifestFile).path === "string" && Number.isFinite((value as ManifestFile).size);

/** The manifest, or null when this build ships no OCR files (or the request failed). */
export function parseManifest(raw: unknown): OcrManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const cores = input.cores as Record<string, unknown> | undefined;
  if (!isFile(input.worker) || !cores || !isFile(cores.simd) || !isFile(cores.baseline) || !Array.isArray(input.languages)) return null;
  const languages = input.languages
    .filter((item): item is { code: string; path: string; size: number } => isFile(item) && typeof (item as { code?: unknown }).code === "string")
    .map((item) => ({ code: item.code, path: item.path, size: item.size }));
  return {
    version: typeof input.version === "string" ? input.version : "",
    worker: { path: input.worker.path, size: input.worker.size },
    cores: { simd: { path: cores.simd.path, size: cores.simd.size }, baseline: { path: cores.baseline.path, size: cores.baseline.size } },
    languages,
  };
}

export async function loadManifest(doFetch: typeof fetch = fetch): Promise<OcrManifest | null> {
  try {
    const response = await doFetch(MANIFEST_URL(), { cache: "no-cache" });
    return response.ok ? parseManifest(await response.json()) : null;
  } catch {
    return null;
  }
}

/** A tiny module that only validates where the engine can use SIMD instructions. */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export const supportsSimd = (): boolean => typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE);

export interface Plan {
  /** The engine file the worker will load (SIMD or not, chosen by the browser). */
  core: string;
  worker: string;
  langPath: string;
  /** Everything that has to be downloaded for these languages, with sizes. */
  files: HeavyFile[];
}

/** What running these languages needs: the worker, one engine build and each language file. */
export function planFor(manifest: OcrManifest, languages: readonly string[], simd: boolean): Plan | null {
  const core = simd ? manifest.cores.simd : manifest.cores.baseline;
  const chosen = languages.map((code) => manifest.languages.find((language) => language.code === code));
  if (chosen.length === 0 || chosen.some((language) => !language)) return null;
  const files: HeavyFile[] = [
    { url: assetUrl(manifest.worker.path), size: manifest.worker.size },
    { url: assetUrl(core.path), size: core.size },
    ...chosen.map((language) => ({ url: assetUrl(language!.path), size: language!.size })),
  ];
  return { core: assetUrl(core.path), worker: assetUrl(manifest.worker.path), langPath: assetUrl("lang"), files };
}

/** All of it, for "remove everything". */
export function allFiles(manifest: OcrManifest): HeavyFile[] {
  return [
    { url: assetUrl(manifest.worker.path), size: manifest.worker.size },
    { url: assetUrl(manifest.cores.simd.path), size: manifest.cores.simd.size },
    { url: assetUrl(manifest.cores.baseline.path), size: manifest.cores.baseline.size },
    ...manifest.languages.map((language) => ({ url: assetUrl(language.path), size: language.size })),
  ];
}

export const LANGUAGE_NAMES: Record<string, { en: string; ru: string }> = {
  eng: { en: "English", ru: "Английский" },
  rus: { en: "Russian", ru: "Русский" },
};
