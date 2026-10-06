import * as React from "react";
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/viewer/ui/button";
import type { AppLang } from "@/lib/apps/lang";
import { t } from "@/lib/viewer/i18n";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

/** Sniffed bytes have no extension to go by, so default to PNG and let the browser sniff. */
export function imageMime(extension: string): string {
  return MIME_BY_EXTENSION[extension] ?? "image/png";
}

type ImageViewProps = {
  lang: AppLang;
  bytes: Uint8Array;
  name: string;
  extension: string;
};

/**
 * Shows an image through an `<img>` fed by a blob URL. Going through `<img>`
 * is what makes SVG safe: images never run scripts or load subresources.
 */
export function ImageView({ lang, bytes, name, extension }: ImageViewProps) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [natural, setNatural] = React.useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = React.useState(false);
  /** "fit" scales down to the window; a number is a multiple of the real size. */
  const [zoom, setZoom] = React.useState<"fit" | number>("fit");

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: imageMime(extension) }));
    setUrl(objectUrl);
    setNatural(null);
    setFailed(false);
    setZoom("fit");
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, extension]);

  const step = (factor: number) => {
    setZoom((current) => {
      const base = current === "fit" ? 1 : current;
      return Math.min(8, Math.max(0.1, base * factor));
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="toolbar" aria-label={t(lang, "imageFit")} data-no-print="" className="flex flex-wrap items-center gap-2 border-b border-(--border) bg-(--bg) px-4 py-1.5">
        <Button variant="ghost" size="icon" onClick={() => step(1 / 1.25)} aria-label={t(lang, "imageZoomOut")}>
          <ZoomOut />
        </Button>
        <span className="w-12 text-center text-sm tabular-nums">{zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <Button variant="ghost" size="icon" onClick={() => step(1.25)} aria-label={t(lang, "imageZoomIn")}>
          <ZoomIn />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setZoom("fit")} aria-label={t(lang, "imageFit")} title={t(lang, "imageFit")} aria-pressed={zoom === "fit"}>
          <Minimize2 />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setZoom(1)} aria-label={t(lang, "imageActual")} title={t(lang, "imageActual")} aria-pressed={zoom === 1}>
          <Maximize2 />
        </Button>
        {natural && (
          <span className="ml-auto text-xs text-(--muted-fg)">{t(lang, "imageSize", { width: natural.width, height: natural.height })}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {failed ? (
          <p role="alert" className="flex h-full items-center justify-center px-4 text-center text-sm text-(--warning)">
            {t(lang, "imageError")}
          </p>
        ) : (
          url && (
            <div className="image-stage" style={zoom === "fit" ? { width: "100%", height: "100%" } : undefined}>
              <img
                src={url}
                alt={name}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setNatural({ width: img.naturalWidth, height: img.naturalHeight });
                }}
                onError={() => setFailed(true)}
                style={
                  zoom === "fit"
                    ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }
                    : natural
                      ? { width: natural.width * zoom, height: natural.height * zoom, maxWidth: "none" }
                      : undefined
                }
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
