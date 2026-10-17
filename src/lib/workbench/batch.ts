/**
 * Shared rules for working on many files at once.
 *
 * Below `BATCH_MIN` files the workbench behaves as it always has: every file is
 * listed, and results follow the settings live. From `BATCH_MIN` on, a set of
 * images is a *batch*: one row in the file list, and work starts on request
 * instead of on every slider tick.
 */

import type { AppLang } from "@/lib/apps/lang";
import { pluralRu } from "@/lib/apps/i18n";

/** The number of images from which they are shown, and processed, as a batch. */
export const BATCH_MIN = 10;

/** How many result rows a batch shows before "show more". */
export const PAGE_SIZE = 50;

export function isBatch(count: number): boolean {
  return count >= BATCH_MIN;
}

/** "1 image", "1,000 images" / "1 изображение", "1 000 изображений". */
export function imagesLabel(lang: AppLang, count: number): string {
  const n = count.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  if (lang === "ru") return `${n} ${pluralRu(count, "изображение", "изображения", "изображений")}`;
  return `${n} ${count === 1 ? "image" : "images"}`;
}

/** A count with the thousands separators of the interface language. */
export function formatCount(lang: AppLang, count: number): string {
  return count.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
}
