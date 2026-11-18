/**
 * A small picture of an image file, drawn onto a canvas when it scrolls into
 * view. No object URL is created and the full-size image is never put in an
 * `<img>`, so a long list of photos costs a few kilobytes each.
 */

import * as React from "react";

import { drawThumb, type ThumbFit } from "@/lib/workbench/thumb";

function useInView(ref: React.RefObject<Element | null>): boolean {
  const [visible, setVisible] = React.useState(() => typeof IntersectionObserver === "undefined");
  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

export interface BlobThumbProps {
  /** The image to show; nothing is drawn while this is null. */
  blob: Blob | null;
  /** Side of the square in pixels (drawn at twice the size for sharp screens). */
  px?: number;
  fit?: ThumbFit;
  className?: string;
}

export function BlobThumb({ blob, px = 80, fit = "cover", className }: BlobThumbProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const visible = useInView(ref);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!blob || !visible || !canvas) return;
    let cancelled = false;
    void drawThumb(blob, canvas, px * 2, fit, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [blob, visible, px, fit]);
  // The bitmap is requested at 2×px and drawn on a 2×px canvas shown at px.
  return <canvas ref={ref} width={px * 2} height={px * 2} className={className} aria-hidden="true" style={{ width: px, height: px }} />;
}
