/**
 * A 40×40 stand-in for an open file in the tray: a real thumbnail for images,
 * a kind glyph for everything else. Decorative — the file name beside it
 * carries the meaning.
 */

import * as React from "react";
import { BookOpen, Braces, FileQuestion, FileText, Table, type LucideIcon } from "lucide-react";

import { imageMime } from "@/components/viewer/viewers/ImageView";
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
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    void asset
      .bytes()
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: imageMime(asset.extension) }));
        setUrl(objectUrl);
      })
      .catch(() => {
        // An unreadable file just keeps the empty slot.
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset]);
  return (
    <span className={SLOT} aria-hidden="true" data-asset-thumb="image">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
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
