import { KeyboardOff, Maximize, Minus, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { stringsFor } from "@/lib/crossword/i18n";
import { gridMetrics, MAX_CELL, MIN_CELL, READABLE_CELL, revealDelta, type GridZoom } from "@/lib/crossword/viewport";
import { Grid, type GridProps } from "./Grid";

/** Native touch/trackpad scrolling and optional mouse dragging; the one input stays mounted. */
export function GridViewport(props: GridProps & { keyboardOpen?: boolean; onDismissKeyboard?(): void }) {
  const T = stringsFor(props.built.puzzle.lang);
  const view = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<GridZoom>(READABLE_CELL);
  const metrics = gridMetrics(props.built.rows, props.built.cols, size.width, size.height, zoom);
  const keepKeyboard = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const previousEdit = useRef({ row: props.cursor.row, col: props.cursor.col, dir: props.cursor.dir, values: props.values });
  useLayoutEffect(() => {
    const prev = previousEdit.current;
    previousEdit.current = { row: props.cursor.row, col: props.cursor.col, dir: props.cursor.dir, values: props.values };
    if (zoom === "fit" && (prev.row !== props.cursor.row || prev.col !== props.cursor.col || prev.dir !== props.cursor.dir || prev.values !== props.values)) {
      setZoom(READABLE_CELL);
    }
  }, [props.cursor.row, props.cursor.col, props.cursor.dir, props.values, zoom]);

  // Auto-follow on typing, clue navigation, zoom and viewport/keyboard resize.
  // Manual panning alone doesn't change these dependencies, so it never snaps back.
  useLayoutEffect(() => {
    const el = view.current;
    const active = el?.querySelector<HTMLElement>(`[data-cell="${props.cursor.row}:${props.cursor.col}"]`);
    if (!el || !active || size.width === 0 || size.height === 0) return;
    if (zoom === "fit") { el.scrollLeft = 0; el.scrollTop = 0; return; }
    const cell = active.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    el.scrollLeft += revealDelta(cell.left, cell.right, rect.left, rect.left + el.clientWidth);
    el.scrollTop += revealDelta(cell.top, cell.bottom, rect.top, rect.top + el.clientHeight);
  }, [props.cursor.row, props.cursor.col, size.width, size.height, zoom]);

  const changeZoom = (next: GridZoom) => {
    setZoom(next);
    if (keepKeyboard.current) props.inputRef.current?.focus({ preventScroll: true });
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || event.pointerType !== "mouse") return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 6) return;
    start.moved = true;
    suppressClick.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.scrollLeft = start.left - dx;
    event.currentTarget.scrollTop = start.top - dy;
  };
  return <div className="cw-stage">
    <div className="cw-zoom-controls" role="group" aria-label={T.gridView}
      onPointerDownCapture={() => { keepKeyboard.current = document.activeElement === props.inputRef.current; }}
      onKeyDownCapture={() => { keepKeyboard.current = false; }}
      onMouseDown={event => event.preventDefault()}>
      <button type="button" className="cw-icon-button" data-zoom="out" aria-label={T.zoomOut}
        disabled={zoom !== "fit" && zoom <= MIN_CELL} onClick={() => changeZoom(Math.max(MIN_CELL, metrics.cell - 8))}><Minus aria-hidden="true" /></button>
      <button type="button" className="cw-fit-button" data-zoom="fit" aria-label={zoom === "fit" ? T.readableSize : T.fitGrid}
        onClick={() => changeZoom(zoom === "fit" ? READABLE_CELL : "fit")}><Maximize aria-hidden="true" />{zoom === "fit" ? "100%" : T.fitGrid}</button>
      <button type="button" className="cw-icon-button" data-zoom="in" aria-label={T.zoomIn}
        disabled={zoom !== "fit" && zoom >= MAX_CELL} onClick={() => changeZoom(Math.min(MAX_CELL, Math.max(MIN_CELL, metrics.cell + 8)))}><Plus aria-hidden="true" /></button>
      <output className="cw-zoom-label" aria-live="polite">{zoom === "fit" ? T.overview : `${Math.round(metrics.cell / READABLE_CELL * 100)}%`}</output>
      <span className="cw-pan-hint">{T.panHint}</span>
      {props.keyboardOpen ? <button type="button" className="cw-icon-button cw-dismiss-keyboard" aria-label={T.hideKeyboard}
        onClick={props.onDismissKeyboard}><KeyboardOff aria-hidden="true" /></button> : null}
    </div>
    <div className="cw-grid-viewport" ref={view} data-view={zoom === "fit" ? "fit" : "readable"}
      onMouseDown={event => { if (event.button === 0) event.preventDefault(); }}
      onPointerDown={event => {
        suppressClick.current = false;
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop, moved: false };
      }} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      <div className="cw-grid-canvas" style={{ minWidth: `${metrics.width + metrics.padding * 2}px`, minHeight: `${metrics.height + metrics.padding * 2}px`, padding: `${metrics.padding}px` }}>
        <Grid {...props} style={{ width: `${metrics.width}px`, height: `${metrics.height}px`, gap: `${metrics.gap}px`, "--cw-cell-px": `${metrics.cell}px` } as CSSProperties}
          onSelect={(row, col) => {
            if (zoom === "fit") setZoom(READABLE_CELL);
            props.onSelect(row, col);
          }} />
      </div>
    </div>
  </div>;
}
