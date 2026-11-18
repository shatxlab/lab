/**
 * A 40×40 stand-in for an open file in the tray: a real thumbnail for images,
 * a kind glyph for everything else. Decorative — the file name beside it
 * carries the meaning.
 */

import * as React from "react";
import { BookOpen, Braces, FileQuestion, FileText, Images, Table, type LucideIcon } from "lucide-react";

import { BlobThumb } from "@/components/workbench/BlobThumb";
import type { Asset } from "@/lib/workbench/asset";
import type { AssetKind } from "@/lib/workbench/kinds";

const GLYPHS: Record<Exclude<AssetKind, "image">, LucideIcon> = {
  pdf: FileText,
  docx: FileText,
  text: FileText,
  markdown: FileText,
  html: FileText,
  sheet: Table,
  json: Braces,
  yaml: Braces,
  toml: Braces,
  epub: BookOpen,
  binary: FileQuestion,
};

const SLOT =
  "grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-(--border) bg-(--bg) text-(--muted-fg)";

function ImageThumb({ asset }: { asset: Asset }) {
  const [blob, setBlob] = React.useState<Blob | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setBlob(null);
    // The file itself, not a copy of its bytes; the thumbnail is decoded small.
    void asset
      .toBlob()
      .then((value) => {
        if (!cancelled) setBlob(value);
      })
      .catch(() => {
        // An unreadable file just keeps the empty slot.
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);
  return (
    <span className={SLOT} aria-hidden="true" data-asset-thumb="image">
      <BlobThumb blob={blob} px={40} />
    </span>
  );
}

export function AssetThumb({ asset }: { asset: Asset }) {
  if (asset.kind === "image") return <ImageThumb asset={asset} />;
  const Glyph = GLYPHS[asset.kind];
  return (
    <span className={SLOT} aria-hidden="true" data-asset-thumb={asset.kind}>
      <Glyph className="size-5" />
    </span>
  );
}

/** The tile for a whole batch of images: one glyph, nothing decoded. */
export function BatchThumb() {
  return (
    <span className={SLOT} aria-hidden="true" data-asset-thumb="batch">
      <Images className="size-5" />
    </span>
  );
}
