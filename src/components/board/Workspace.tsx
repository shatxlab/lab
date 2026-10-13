/**
 * One board on screen: an SVG surface with the elements as nodes, a selection
 * layer in screen space, pointer gestures, a toolbar and keyboard shortcuts.
 * The state that is the user's work (elements, history) lives here; the shell
 * is told about it, debounced, to save.
 */

import * as React from "react";
import {
  Circle,
  Copy,
  Download,
  Grid3x3,
  Hand,
  Maximize,
  MousePointer2,
  Minus,
  MoveUpRight,
  Pencil,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
} from "lucide-react";

import { renderNode } from "@/components/board/render";
import { ActionButton } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { useDark } from "@/lib/apps/use-dark";
import { boundsOf, handlesOf, topmostAt, unionOf, type Box, type Point } from "@/lib/board/geometry";
import {
  begin,
  finish,
  marqueeBox,
  newText,
  panView,
  pinchView,
  preview,
  update,
  type Gesture,
  type Tool,
} from "@/lib/board/gesture";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/board/history";
import { tb } from "@/lib/board/i18n";
import {
  COLOR_KEYS,
  WIDTHS,
  newId,
  textSizeFor,
  type Board,
  type BoardElement,
  type ColorKey,
  type Style,
  type View,
} from "@/lib/board/model";
import { parseBoardFile, serializeBoard } from "@/lib/board/storage";
import { boardSvg, colorOf, describeElement } from "@/lib/board/svg";
import { clampZoom, fitView, panBy, toScreen, toWorld, zoomAt, ZOOM_STEP } from "@/lib/board/viewport";
import { paletteFor } from "@/lib/charts/palette";
import { svgBytes, svgToPng } from "@/lib/charts/export";
import { cn } from "@/lib/viewer/utils";

const GRID = 24;
const HANDLE = 8;
const TOOLS: { tool: Tool; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>; key: string }[] = [
  { tool: "select", icon: MousePointer2, key: "v" },
  { tool: "rect", icon: Square, key: "r" },
  { tool: "ellipse", icon: Circle, key: "o" },
  { tool: "arrow", icon: MoveUpRight, key: "a" },
  { tool: "pen", icon: Pencil, key: "p" },
  { tool: "text", icon: Type, key: "t" },
  { tool: "hand", icon: Hand, key: "h" },
];
const COLOR_LABEL: Record<ColorKey, "colorInk" | "colorBlue" | "colorOrange" | "colorGreen" | "colorRed" | "colorViolet"> = {
  ink: "colorInk",
  blue: "colorBlue",
  orange: "colorOrange",
  green: "colorGreen",
  red: "colorRed",
  violet: "colorViolet",
};
const WIDTH_LABEL = ["widthThin", "widthMedium", "widthThick"] as const;

export interface WorkspaceProps {
  lang: AppLang;
  board: Board;
  grid: boolean;
  onGrid: (on: boolean) => void;
  /** Called (debounced) with the board's current content. */
  onSave: (elements: BoardElement[], view: View) => void;
  onImport: (board: Board) => void;
  /** Tell the shell something the user should read (it outlives this board's workspace). */
  onNotice: (message: string) => void;
}

const isTyping = (target: EventTarget | null): boolean => target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable]"));

function kindLabel(lang: AppLang, el: BoardElement): string {
  switch (el.type) {
    case "rect":
      return tb(lang, "kindRect");
    case "ellipse":
      return tb(lang, "kindEllipse");
    case "arrow":
      return tb(lang, "kindArrow");
    case "pen":
      return tb(lang, "kindPen");
    default:
      return tb(lang, "kindText", { text: el.text.slice(0, 40) });
  }
}

export function Workspace({ lang, board, grid, onGrid, onSave, onImport, onNotice }: WorkspaceProps) {
  const dark = useDark();
  const palette = paletteFor(dark);

  const [hist, setHist] = React.useState<History<BoardElement[]>>(() => createHistory(board.elements));
  const elements = hist.present;
  const [selection, setSelection] = React.useState<string[]>([]);
  const [tool, setTool] = React.useState<Tool>("select");
  const [style, setStyle] = React.useState<Style>({ color: "ink", fill: false, width: 4 });
  const [view, setView] = React.useState<View>(board.view);
  const [gesture, setGesture] = React.useState<Gesture | null>(null);
  const [editing, setEditing] = React.useState<{ element: Extract<BoardElement, { type: "text" }>; isNew: boolean } | null>(null);
  const [size, setSize] = React.useState({ w: 800, h: 560 });

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const gestureRef = React.useRef<Gesture | null>(null);
  const pointers = React.useRef(new Map<number, Point>());
  const pinch = React.useRef<{ ids: [number, number]; a0: Point; b0: Point; startView: View } | null>(null);
  const spaceHeld = React.useRef(false);
  const ignoreUntilUp = React.useRef(false);
  const live = React.useRef({ elements, view });
  live.current = { elements, view };

  /** Picking a tool other than Select starts something new, so whatever was selected is let go. */
  const chooseTool = (next: Tool) => {
    setTool(next);
    if (next !== "select") setSelection([]);
  };
  const setGestureBoth = (next: Gesture | null) => {
    gestureRef.current = next;
    setGesture(next);
  };
  const commitElements = (next: BoardElement[]) => setHist((h) => commit(h, next));

  // The canvas fills its box and follows it as it resizes.
  React.useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Save a moment after the last change, and once more on the way out.
  const saveRef = React.useRef(onSave);
  saveRef.current = onSave;
  React.useEffect(() => {
    const id = window.setTimeout(() => saveRef.current(elements, view), 400);
    return () => window.clearTimeout(id);
  }, [elements, view]);
  React.useEffect(() => {
    const flush = () => saveRef.current(live.current.elements, live.current.view);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // Keep the selection to things that still exist (after an undo, say).
  React.useEffect(() => {
    setSelection((current) => {
      const alive = current.filter((id) => elements.some((el) => el.id === id));
      return alive.length === current.length ? current : alive;
    });
  }, [elements]);

  const screenOf = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /* ---------------------------------------------------------- text editing */

  const finishEdit = (value: string) => {
    if (!editing) return;
    const { element, isNew } = editing;
    setEditing(null);
    const text = value.replace(/\s+$/, "");
    if (isNew) {
      if (text === "") return;
      commitElements([...elements, { ...element, text }]);
      setSelection([element.id]);
    } else if (text === "") {
      commitElements(elements.filter((el) => el.id !== element.id));
      setSelection([]);
    } else if (text !== element.text) {
      commitElements(elements.map((el) => (el.id === element.id ? { ...element, text } : el)));
    }
  };

  const startEdit = (element: Extract<BoardElement, { type: "text" }>, isNew: boolean) => {
    setGestureBoth(null);
    setEditing({ element, isNew });
  };

  /* -------------------------------------------------------------- pointers */

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 2) return;
    wrapRef.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const screen = screenOf(event);
    pointers.current.set(event.pointerId, screen);

    if (pointers.current.size === 2) {
      // A second finger turns the touch into move-and-zoom; whatever was being drawn is dropped.
      const [[idA, a0], [idB, b0]] = [...pointers.current.entries()] as [[number, Point], [number, Point]];
      pinch.current = { ids: [idA, idB], a0, b0, startView: view };
      setGestureBoth(null);
      ignoreUntilUp.current = true;
      return;
    }
    if (pointers.current.size > 2 || ignoreUntilUp.current) return;

    if (editing) finishEdit((document.querySelector("textarea[data-board-text]") as HTMLTextAreaElement | null)?.value ?? editing.element.text);

    const world = toWorld(view, screen.x, screen.y);
    const reach = event.pointerType === "touch" ? 14 : 6;

    if (tool === "text") {
      const hit = topmostAt(elements, world, reach / view.zoom);
      if (hit?.type === "text") {
        setSelection([hit.id]);
        startEdit(hit, false);
      } else {
        startEdit(newText(world, style) as Extract<BoardElement, { type: "text" }>, true);
      }
      event.preventDefault();
      return;
    }

    const begun = begin({ tool, style, elements, selection, world, screen, view, reach, shift: event.shiftKey, pan: event.button === 1 || spaceHeld.current });
    setSelection(begun.selection);
    setGestureBoth(begun.gesture);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const screen = screenOf(event);
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, screen);

    const two = pinch.current;
    if (two) {
      const a = pointers.current.get(two.ids[0]);
      const b = pointers.current.get(two.ids[1]);
      if (a && b) setView(pinchView(two.startView, two.a0, two.b0, a, b, clampZoom));
      return;
    }
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === "pan") {
      setView(panView(g, screen));
      return;
    }
    setGestureBoth(update(g, toWorld(view, screen.x, screen.y), view, event.shiftKey));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pinch.current && pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) ignoreUntilUp.current = false;
    const g = gestureRef.current;
    if (!g) return;
    setGestureBoth(null);
    if (g.kind === "pan") return;
    const done = finish(g, elements, view);
    if (done.elements !== elements) commitElements(done.elements);
    if (done.selection) setSelection(done.selection);
  };

  const onPointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) ignoreUntilUp.current = false;
    setGestureBoth(null);
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const screen = screenOf(event);
    const hit = topmostAt(elements, toWorld(view, screen.x, screen.y), 6 / view.zoom);
    if (hit?.type === "text") {
      setSelection([hit.id]);
      startEdit(hit, false);
    }
  };

  // The wheel pans; with Ctrl (which is also how a trackpad pinch arrives) it zooms.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((current) =>
        event.ctrlKey || event.metaKey
          ? zoomAt(current, event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.01))
          : panBy(current, -event.deltaX, -event.deltaY),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ------------------------------------------------------------- commands */

  const selected = elements.filter((el) => selection.includes(el.id));
  const shown = preview(gesture, elements);

  const restyle = (patch: Partial<Style>) => {
    const next = { ...style, ...patch };
    setStyle(next);
    if (selected.length === 0) return;
    commitElements(
      elements.map((el) => {
        if (!selection.includes(el.id)) return el;
        const changed = { ...el, ...patch, ...(patch.fill !== undefined && el.type !== "rect" && el.type !== "ellipse" ? { fill: el.fill } : {}) };
        return changed.type === "text" && patch.width !== undefined ? { ...changed, size: textSizeFor(patch.width) } : changed;
      }),
    );
  };

  const remove = () => {
    if (selection.length === 0) return;
    commitElements(elements.filter((el) => !selection.includes(el.id)));
    setSelection([]);
  };

  const duplicate = () => {
    if (selected.length === 0) return;
    const copies = selected.map((el) => {
      const copy = { ...el, id: newId() } as BoardElement;
      return copy.type === "pen"
        ? { ...copy, points: copy.points.map((v) => v + 16) }
        : copy.type === "arrow"
          ? { ...copy, x1: copy.x1 + 16, y1: copy.y1 + 16, x2: copy.x2 + 16, y2: copy.y2 + 16 }
          : { ...copy, x: copy.x + 16, y: copy.y + 16 };
    });
    commitElements([...elements, ...copies]);
    setSelection(copies.map((c) => c.id));
  };

  const nudge = (dx: number, dy: number) => {
    if (selection.length === 0) return;
    commitElements(
      elements.map((el) => {
        if (!selection.includes(el.id)) return el;
        return el.type === "pen"
          ? { ...el, points: el.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) }
          : el.type === "arrow"
            ? { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
            : { ...el, x: el.x + dx, y: el.y + dy };
      }),
    );
  };

  const zoomBy = (factor: number) => setView((current) => zoomAt(current, size.w / 2, size.h / 2, factor));
  const fit = () => setView(fitView(unionOf(elements.map(boundsOf)), size.w, size.h));

  const doUndo = () => setHist((h) => undo(h));
  const doRedo = () => setHist((h) => redo(h));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTyping(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") {
      event.preventDefault();
      return event.shiftKey ? doRedo() : doUndo();
    }
    if (mod && key === "y") {
      event.preventDefault();
      return doRedo();
    }
    if (mod && key === "a") {
      event.preventDefault();
      return setSelection(elements.map((el) => el.id));
    }
    if (mod && key === "d") {
      event.preventDefault();
      return duplicate();
    }
    if (mod && key === "0") {
      event.preventDefault();
      return setView({ ...view, zoom: 1 });
    }
    if (mod) return;
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      return remove();
    }
    if (key === "escape") {
      setGestureBoth(null);
      return setSelection([]);
    }
    if (key === " ") {
      event.preventDefault();
      spaceHeld.current = true;
      return;
    }
    if (key === "+" || key === "=") return zoomBy(ZOOM_STEP);
    if (key === "-" || key === "_") return zoomBy(1 / ZOOM_STEP);
    if (key.startsWith("arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      return nudge(key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
    }
    const hit = TOOLS.find((entry) => entry.key === key);
    if (hit) chooseTool(hit.tool);
  };
  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key === " ") spaceHeld.current = false;
  };

  /* --------------------------------------------------------------- export */

  const exportSvg = () => boardSvg(elements, { palette, background: true });
  /** `Sprint plan` → `Sprint-plan.svg`. */
  const fileName = (extension: string) => `${board.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "board"}.${extension}`;
  const download = (kind: "svg" | "png" | "json") => {
    onNotice("");
    if (kind === "json") {
      saveBlob(new Blob([serializeBoard({ ...board, elements })], { type: "application/json" }), fileName("json"));
    } else if (kind === "svg") {
      saveBlob(new Blob([svgBytes(exportSvg()) as unknown as BlobPart], { type: "image/svg+xml" }), fileName("svg"));
    } else {
      void svgToPng(exportSvg())
        .then((bytes) => saveBlob(new Blob([bytes as unknown as BlobPart], { type: "image/png" }), fileName("png")))
        .catch(() => onNotice(tb(lang, "exportFailed")));
    }
  };

  const openFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const parsed = parseBoardFile(await file.text());
    onNotice(parsed ? tb(lang, "imported", { name: parsed.name }) : tb(lang, "importFailed"));
    if (parsed) onImport(parsed);
  };

  /* ---------------------------------------------------------------- render */

  const marquee = gesture?.kind === "marquee" ? marqueeBox(gesture) : null;
  const screenBox = (box: Box) => {
    const a = toScreen(view, { x: box.x, y: box.y });
    return { x: a.x, y: a.y, w: box.w * view.zoom, h: box.h * view.zoom };
  };
  const single = tool === "select" && selected.length === 1 && !gesture ? selected[0]! : null;
  const gridStep = GRID * view.zoom;
  const cursor = spaceHeld.current || tool === "hand" ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";

  const buttonClass = (on: boolean) =>
    cn(
      "inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-(--fg) transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:opacity-40",
      on ? "border-(--accent) bg-(--accent)/15 text-(--accent)" : "border-(--border) bg-(--bg) hover:bg-(--surface)",
    );

  return (
    <div className="flex flex-col gap-3">
      <div role="toolbar" aria-label={tb(lang, "toolbar")} className="flex flex-nowrap items-center gap-x-4 gap-y-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <div role="group" aria-label={tb(lang, "toolbar")} className="flex shrink-0 gap-1">
          {TOOLS.map(({ tool: id, icon: Icon, key }) => (
            <button key={id} type="button" aria-pressed={tool === id} aria-label={tb(lang, id)} title={`${tb(lang, id)} (${key.toUpperCase()})`} onClick={() => chooseTool(id)} className={buttonClass(tool === id)}>
              <Icon aria-hidden="true" className="size-4" />
            </button>
          ))}
        </div>

        <div role="group" aria-label={tb(lang, "colors")} className="flex shrink-0 items-center gap-1">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={style.color === key}
              aria-label={tb(lang, COLOR_LABEL[key])}
              title={tb(lang, COLOR_LABEL[key])}
              onClick={() => restyle({ color: key })}
              className={cn("size-7 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)", style.color === key ? "border-(--fg)" : "border-(--border)")}
              style={{ background: colorOf(palette, key) }}
            />
          ))}
        </div>

        <div role="group" aria-label={tb(lang, "width")} className="flex shrink-0 items-center gap-1">
          {WIDTHS.map((w, i) => (
            <button key={w} type="button" aria-pressed={style.width === w} aria-label={tb(lang, WIDTH_LABEL[i]!)} title={tb(lang, WIDTH_LABEL[i]!)} onClick={() => restyle({ width: w })} className={buttonClass(style.width === w)}>
              <span aria-hidden="true" className="w-4 rounded-full bg-current" style={{ height: Math.max(2, w - 1) }} />
            </button>
          ))}
          <button type="button" aria-pressed={style.fill} aria-label={tb(lang, "fill")} title={tb(lang, "fill")} onClick={() => restyle({ fill: !style.fill })} className={buttonClass(style.fill)}>
            <Square aria-hidden="true" className="size-4 fill-current opacity-40" />
          </button>
        </div>

        <div role="group" className="flex shrink-0 gap-1">
          <button type="button" aria-label={tb(lang, "undo")} title={`${tb(lang, "undo")} (Ctrl+Z)`} disabled={!canUndo(hist)} onClick={doUndo} className={buttonClass(false)}>
            <Undo2 aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={tb(lang, "redo")} title={`${tb(lang, "redo")} (Ctrl+Shift+Z)`} disabled={!canRedo(hist)} onClick={doRedo} className={buttonClass(false)}>
            <Redo2 aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={tb(lang, "duplicate")} title={`${tb(lang, "duplicate")} (Ctrl+D)`} disabled={selected.length === 0} onClick={duplicate} className={buttonClass(false)}>
            <Copy aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={tb(lang, "delete")} title={`${tb(lang, "delete")} (Del)`} disabled={selected.length === 0} onClick={remove} className={buttonClass(false)}>
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div role="group" className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label={tb(lang, "zoomOut")} title={tb(lang, "zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)} className={buttonClass(false)}>
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <span className="min-w-12 text-center text-xs tabular-nums text-(--muted-fg)" aria-label={tb(lang, "zoomLevel", { n: Math.round(view.zoom * 100) })}>
            {Math.round(view.zoom * 100)}%
          </span>
          <button type="button" aria-label={tb(lang, "zoomIn")} title={tb(lang, "zoomIn")} onClick={() => zoomBy(ZOOM_STEP)} className={buttonClass(false)}>
            <Plus aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={tb(lang, "zoomFit")} title={tb(lang, "zoomFit")} onClick={fit} className={buttonClass(false)}>
            <Maximize aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-pressed={grid} aria-label={tb(lang, "grid")} title={tb(lang, "grid")} onClick={() => onGrid(!grid)} className={buttonClass(grid)}>
            <Grid3x3 aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div role="group" aria-label={tb(lang, "file")} className="flex shrink-0 gap-1">
          <ActionButton variant="secondary" className="h-9 px-3 text-xs" onClick={() => download("svg")}>
            <Download aria-hidden="true" className="size-3.5" />
            SVG
          </ActionButton>
          <ActionButton variant="secondary" className="h-9 px-3 text-xs" onClick={() => download("png")}>
            <Download aria-hidden="true" className="size-3.5" />
            PNG
          </ActionButton>
          <ActionButton variant="secondary" className="h-9 px-3 text-xs" title={tb(lang, "exportJson")} aria-label={tb(lang, "exportJson")} onClick={() => download("json")}>
            <Download aria-hidden="true" className="size-3.5" />
            JSON
          </ActionButton>
          <ActionButton variant="secondary" className="h-9 px-3 text-xs" aria-label={tb(lang, "importBoard")} title={tb(lang, "importBoard")} onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden="true" className="size-3.5" />
          </ActionButton>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void openFile(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        aria-label={`${tb(lang, "canvas", { n: elements.length })}. ${tb(lang, "canvasHelp")}`}
        role="group"
        className="relative h-[62dvh] min-h-80 w-full sm:h-[68dvh] touch-none overflow-hidden rounded-xl border border-(--border) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        style={{ background: palette.surface }}
      >
        <svg
          ref={svgRef}
          className="block size-full select-none"
          style={{ cursor, touchAction: "none" }}
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onDoubleClick={onDoubleClick}
        >
          {grid && view.zoom >= 0.4 && (
            <>
              <defs>
                <pattern id="board-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse" x={-view.x * view.zoom} y={-view.y * view.zoom}>
                  <circle cx={1} cy={1} r={1} fill={palette.grid} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#board-grid)" />
            </>
          )}
          <g transform={`translate(${-view.x * view.zoom} ${-view.y * view.zoom}) scale(${view.zoom})`}>
            {shown.filter((el) => el.id !== editing?.element.id).map((el) => renderNode(describeElement(el, palette), el.id))}
          </g>

          {/* Selection and handles, in screen pixels so they stay the same size at any zoom. */}
          <g fill="none" stroke="var(--accent)" strokeWidth={1.5} pointerEvents="none">
            {selected.map((el) => {
              const b = screenBox(boundsOf(shown.find((s) => s.id === el.id) ?? el));
              return <rect key={el.id} x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} strokeDasharray="5 4" rx={3} />;
            })}
            {marquee && (() => {
              const b = screenBox(marquee);
              return <rect x={b.x} y={b.y} width={b.w} height={b.h} strokeDasharray="4 3" fill="var(--accent)" fillOpacity={0.08} />;
            })()}
          </g>
          {single &&
            handlesOf(shown.find((s) => s.id === single.id) ?? single).map((h) => {
              const p = toScreen(view, h);
              return <rect key={h.id} x={p.x - HANDLE / 2} y={p.y - HANDLE / 2} width={HANDLE} height={HANDLE} rx={2} fill={palette.surface} stroke="var(--accent)" strokeWidth={1.5} pointerEvents="none" />;
            })}
        </svg>

        {editing && (
          <textarea
            data-board-text=""
            aria-label={tb(lang, "textLabel")}
            title={tb(lang, "textHint")}
            autoFocus
            defaultValue={editing.element.text}
            rows={Math.max(1, editing.element.text.split("\n").length)}
            spellCheck={false}
            onBlur={(event) => finishEdit(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                setEditing(null);
              } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                finishEdit(event.currentTarget.value);
              }
            }}
            className="absolute resize-none overflow-hidden border border-dashed border-(--accent) bg-transparent p-0 outline-none"
            style={{
              left: toScreen(view, editing.element).x,
              top: toScreen(view, editing.element).y,
              fontSize: editing.element.size * view.zoom,
              lineHeight: 1.25,
              color: colorOf(palette, editing.element.color),
              minWidth: 80,
              width: Math.max(120, 14 * editing.element.size * view.zoom * 0.6),
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            }}
          />
        )}

        {elements.length === 0 && !editing && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm" style={{ color: palette.muted }}>
            {tb(lang, "hint")}
          </p>
        )}

        <ul className="sr-only" aria-label={tb(lang, "elementList")}>
          {elements.slice(0, 200).map((el) => (
            <li key={el.id}>{kindLabel(lang, el)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
