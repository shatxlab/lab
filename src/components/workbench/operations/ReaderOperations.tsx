/**
 * `book.read` — the EPUB reader as a workbench operation. The reader keeps
 * its own chapters/search/bookmarks UI; the workbench owns the file.
 */

import EpubReader from "@/components/apps/EpubReader";
import type { OperationProps } from "@/lib/workbench/operation";

export function BookReadOperation({ assets }: OperationProps) {
  const asset = assets[0];
  return asset ? <EpubReader key={asset.id} asset={asset} /> : null;
}
