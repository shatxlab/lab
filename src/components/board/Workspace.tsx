/**
 * The board on screen: an SVG surface with the elements as nodes, pointer
 * gestures, a small toolbar and keyboard shortcuts. The state that is the
 * user's work (elements, history) lives here; the shell is told about it,
 * debounced, to save.
 */

import * as React from "react";
import { Download, MoveUpRight, Redo2, Square, Trash2, Type, Undo2 } from "lucide-react";

import { renderNode } from "@/components/board/render";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { topmostAt, type Point } from "@/lib/board/geometry";
import { begin, finish, newText, panView, pinchView, preview, update, type Gesture, type Tool } from "@/lib/board/gesture";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/board/history";
import { tb } from "@/lib/board/i18n";
import { INK, MUTED, SURFACE, TEXT_SIZE, type BoardElement, type TextElement, type View } from "@/lib/board/model";
import type { BoardState } from "@/lib/board/storage";
import { boardSvg, describeElement } from "@/lib/board/svg";
import { clampZoom, panBy, toScreen, toWorld, zoomAt } from "@/lib/board/viewport";
import { svgToPng } from "@/lib/charts/export";
import { cn } from "@/lib/viewer/utils";

const TOOLS: { tool: Tool; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>; key: string }[] = [
  { tool: "rect", icon: Square, key: "r" },
  { tool: "arrow", icon: MoveUpRight, key: "a" },
  { tool: "text", icon: Type, key: "t" },
];

export interface WorkspaceProps {
  lang: AppLang;
  board: BoardState;
  /** Called (debounced) with the board's current content. */
  onSave: (elements: BoardElement[], view: View) => void;
}

function kindLabel(lang: AppLang, el: BoardElement): string {
  switch (el.type) {
    case "rect":
      return tb(lang, "kindRect");
    case "arrow":
      return tb(lang, "kindArrow");
    default:
      return tb(lang, "kindText", { text: el.text.slice(0, 40) });
  }
}

const isTyping = (target: EventTarget | null): boolean => target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable]"));

export function Workspace({ lang, board, onSave }: WorkspaceProps) {
  const [hist, setHist] = React.useState<History<BoardElement[]>>(() => createHistory(board.elements));
  const elements = hist.present;
  /** The picked tool; null is the automatic mode that moves an element or the canvas. */
  const [tool, setTool] = React.useState<Tool | null>(null);
  const [view, setView] = React.useState<View>(board.view);
  const [gesture, setGesture] = React.useState<Gesture | null>(null);
  const [editing, setEditing] = React.useState<{ element: TextElement; isNew: boolean } | null>(null);
  const [failed, setFailed] = React.useState(false);

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const gestureRef = React.useRef<Gesture | null>(null);
  const pointers = React.useRef(new Map<number, Point>());
  const pinch = React.useRef<{ ids: [number, number]; a0: Point; b0: Point; startView: View } | null>(null);
  const ignoreUntilUp = React.useRef(false);
  const live = React.useRef({ elements, view });
  live.current = { elements, view };

  const setGestureBoth = (next: Gesture | null) => {
    gestureRef.current = next;
    setGesture(next);
  };
  const commitElements = (next: BoardElement[]) => setHist((h) => commit(h, next));

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
      if (text !== "") commitElements([...elements, { ...element, text }]);
    } else if (text === "") {
      commitElements(elements.filter((el) => el.id !== element.id));
    } else if (text !== element.text) {
      commitElements(elements.map((el) => (el.id === element.id ? { ...element, text } : el)));
    }
  };

  const startEdit = (element: TextElement, isNew: boolean) => {
    setGestureBoth(null);
    setTool(null);
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
      if (hit?.type === "text") startEdit(hit, false);
      else startEdit(newText(world), true);
      event.preventDefault();
      return;
    }
    setGestureBoth(begin({ tool, elements, world, screen, view, reach }));
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
    setGestureBoth(update(g, toWorld(view, screen.x, screen.y), view));
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
    // One drawing per pick: the tool lets go, and dragging moves things again.
    if (g.kind === "draw") setTool(null);
    const edit = done.edit ? elements.find((el) => el.id === done.edit) : undefined;
    if (edit?.type === "text") startEdit(edit, false);
  };

  const onPointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) ignoreUntilUp.current = false;
    setGestureBoth(null);
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

  const shown = preview(gesture, elements);

  const doUndo = () => {
    setGestureBoth(null);
    setHist(undo);
  };
  const doRedo = () => {
    setGestureBoth(null);
    setHist(redo);
  };
  const clear = () => {
    if (elements.length === 0) return;
    setGestureBoth(null);
    commitElements([]);
  };
  const pick = (next: Tool) => setTool((current) => (current === next ? null : next));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTyping(event.target)) return;
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    if (mod && key === "z") {
      event.preventDefault();
      return event.shiftKey ? doRedo() : doUndo();
    }
    if (mod && key === "y") {
      event.preventDefault();
      return doRedo();
    }
    if (mod || event.altKey) return;
    if (key === "escape") {
      setGestureBoth(null);
      return setTool(null);
    }
    const hit = TOOLS.find((entry) => entry.key === key);
    if (hit) pick(hit.tool);
  };

  /* --------------------------------------------------------------- export */

  const download = () => {
    setFailed(false);
    void svgToPng(boardSvg(elements))
      .then((bytes) => saveBlob(new Blob([bytes as unknown as BlobPart], { type: "image/png" }), "whiteboard.png"))
      .catch(() => setFailed(true));
  };

  /* ---------------------------------------------------------------- render */

  const cursor = tool === "text" ? "text" : tool ? "crosshair" : gesture?.kind === "pan" ? "grabbing" : "default";
  const buttonClass = (on: boolean) =>
    cn(
      "inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-(--fg) transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-40",
      on ? "border-(--accent) bg-(--accent)/15 text-(--accent)" : "border-(--border) bg-(--bg) hover:bg-(--surface)",
    );

  return (
    <div className="flex flex-col gap-3">
      <div role="toolbar" aria-label={tb(lang, "toolbar")} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" className="flex gap-1">
          {TOOLS.map(({ tool: id, icon: Icon, key }) => (
            <button key={id} type="button" aria-pressed={tool === id} aria-label={tb(lang, id)} title={`${tb(lang, id)} (${key.toUpperCase()})`} onClick={() => pick(id)} className={buttonClass(tool === id)}>
              <Icon aria-hidden="true" className="size-4" />
            </button>
          ))}
        </div>
        <div role="group" className="flex gap-1">
          <button type="button" aria-label={tb(lang, "undo")} title={`${tb(lang, "undo")} (Ctrl+Z)`} disabled={!canUndo(hist)} onClick={doUndo} className={buttonClass(false)}>
            <Undo2 aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={tb(lang, "redo")} title={`${tb(lang, "redo")} (Ctrl+Shift+Z)`} disabled={!canRedo(hist)} onClick={doRedo} className={buttonClass(false)}>
            <Redo2 aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={tb(lang, "clear")} title={tb(lang, "clear")} disabled={elements.length === 0} onClick={clear} className={buttonClass(false)}>
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
        <button type="button" aria-label={tb(lang, "download")} title={tb(lang, "download")} onClick={download} className={buttonClass(false)}>
          <Download aria-hidden="true" className="size-4" />
        </button>
        {failed && (
          <span role="alert" className="text-sm text-(--warning)">
            {tb(lang, "exportFailed")}
          </span>
        )}
      </div>

      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`${tb(lang, "canvas", { n: elements.length })}. ${tb(lang, "canvasHelp")}`}
        role="group"
        className="relative h-[62dvh] min-h-80 w-full touch-none overflow-hidden rounded-xl border border-(--border) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:h-[68dvh]"
        style={{ background: SURFACE }}
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
        >
          <g transform={`translate(${-view.x * view.zoom} ${-view.y * view.zoom}) scale(${view.zoom})`}>
            {shown.filter((el) => el.id !== editing?.element.id).map((el) => renderNode(describeElement(el), el.id))}
          </g>
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
              fontSize: TEXT_SIZE * view.zoom,
              lineHeight: 1.25,
              color: INK,
              minWidth: 80,
              width: Math.max(120, 14 * TEXT_SIZE * view.zoom * 0.6),
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            }}
          />
        )}

        {elements.length === 0 && !editing && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm" style={{ color: MUTED }}>
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
