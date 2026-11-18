/**
 * The chart on the page: the scene's SVG, plus a hover layer on top. The SVG is
 * the same string that gets exported; the layer draws only the crosshair, the
 * ringed dots or the highlighted band, and a tooltip. Pointer and keyboard show
 * the same details, and everything a tooltip says is also in the data table.
 */

import * as React from "react";

import type { Hit, Scene } from "@/lib/charts/build";
import type { Palette } from "@/lib/charts/palette";
import { cn } from "@/lib/viewer/utils";

/** The pointer has to be within this many chart pixels of a dot to select it. */
const POINT_REACH = 24;

/** Which hit the pointer (in chart coordinates) is aimed at, if any. */
export function findHit(scene: Scene, x: number, y: number): number | null {
  const { plot, hits, hitMode } = scene;
  if (hits.length === 0) return null;
  if (hitMode === "band") {
    const index = hits.findIndex((hit) => x >= hit.x && x < hit.x + hit.w! && y >= hit.y && y < hit.y + hit.h!);
    return index >= 0 ? index : null;
  }
  const inside = x >= plot.left - 12 && x <= plot.right + 12 && y >= plot.top - 8 && y <= plot.bottom + 8;
  if (!inside) return null;
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i]!;
    const distance = hitMode === "x" ? Math.abs(hit.x - x) : Math.hypot(hit.x - x, hit.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  if (best === null) return null;
  // A dot must be near; a crosshair snaps to the closest x wherever the pointer is.
  return hitMode === "point" && bestDistance > POINT_REACH ? null : best;
}

/** Where the tooltip hangs, in chart coordinates. */
function anchorOf(scene: Scene, hit: Hit): { x: number; y: number } {
  if (scene.hitMode === "band") return { x: hit.x + hit.w! / 2, y: hit.y + 12 };
  if (scene.hitMode === "x") return { x: hit.x, y: scene.plot.top + 12 };
  return { x: hit.x, y: hit.y };
}

export interface ChartViewProps {
  scene: Scene;
  palette: Palette;
  label: string;
  /** Spoken once when the chart takes focus. */
  help: string;
  className?: string;
}

export function ChartView({ scene, palette, label, help, className }: ChartViewProps) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState<number | null>(null);
  const [scale, setScale] = React.useState(1);
  const hit = active === null ? null : (scene.hits[active] ?? null);

  // A new chart starts with nothing selected.
  React.useEffect(() => setActive(null), [scene]);

  const toChart = (event: { clientX: number; clientY: number }) => {
    const rect = boxRef.current!.getBoundingClientRect();
    const k = scene.width / Math.max(1, rect.width);
    setScale(1 / k);
    return { x: (event.clientX - rect.left) * k, y: (event.clientY - rect.top) * k };
  };

  const onMove = (event: React.PointerEvent) => {
    const point = toChart(event);
    setActive(findHit(scene, point.x, point.y));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = scene.hits.length - 1;
    if (last < 0) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      const rect = boxRef.current?.getBoundingClientRect();
      if (rect) setScale(rect.width / scene.width);
      setActive((current) => Math.min(last, Math.max(0, (current ?? (step > 0 ? -1 : last + 1)) + step)));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(last);
    } else if (event.key === "Escape") setActive(null);
  };

  const anchor = hit ? anchorOf(scene, hit) : null;
  // Hang the tooltip to the left of the anchor when it would run off the right edge.
  const flip = anchor !== null && anchor.x * scale > (boxRef.current?.clientWidth ?? 0) * 0.62;

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={`${label}. ${help}`}
      tabIndex={0}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      onKeyDown={onKeyDown}
      className={cn(
        "relative touch-pan-y overflow-hidden rounded-xl border border-(--border) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)",
        className,
      )}
    >
      <div dangerouslySetInnerHTML={{ __html: scene.svg }} className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" />

      {hit && (
        <svg viewBox={`0 0 ${scene.width} ${scene.height}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {scene.hitMode === "x" && <line x1={hit.x} x2={hit.x} y1={scene.plot.top} y2={scene.plot.bottom} stroke={palette.muted} strokeWidth={1} />}
          {scene.hitMode === "band" && <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} rx={4} fill={palette.ink} fillOpacity={0.07} />}
          {hit.marks.map((mark, i) => (
            <g key={i}>
              <circle cx={mark.x} cy={mark.y} r={9} fill="none" stroke={palette.series[mark.slot % palette.series.length]} strokeOpacity={0.4} strokeWidth={3} />
              <circle cx={mark.x} cy={mark.y} r={5} fill={palette.series[mark.slot % palette.series.length]} stroke={palette.surface} strokeWidth={2} />
            </g>
          ))}
        </svg>
      )}

      {hit && anchor && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-32 max-w-64 rounded-lg border px-3 py-2 text-xs shadow-lg"
          style={{
            left: anchor.x * scale,
            top: anchor.y * scale,
            transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, 0)`,
            background: palette.surface,
            color: palette.secondary,
            borderColor: palette.grid,
          }}
        >
          <div className="mb-1 break-words font-medium" style={{ color: palette.secondary }}>
            {hit.title}
          </div>
          {hit.rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              {row.slot !== null && <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: palette.series[row.slot % palette.series.length] }} />}
              <span className="text-sm font-semibold" style={{ color: palette.ink }}>
                {row.value}
              </span>
              <span className="truncate">{row.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
