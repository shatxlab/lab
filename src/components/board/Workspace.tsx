/**
 * The board on screen: an SVG surface with the elements as nodes, pointer
 * gestures, a small toolbar and keyboard shortcuts. The state that is the
 * user's work (elements, history) lives here; the shell is told about it,
 * debounced, to save.
 */

import * as React from "react";
import { Download, MoveUpRight, Plus, Redo2, Square, Trash2, Type, Undo2 } from "lucide-react";

import { renderNode } from "@/components/board/render";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
import { boundsOf, connect, fitLabel, remove, snap, textSize, topmostAt, type Point } from "@/lib/board/geometry";
import { SNAP, begin, boxBeside, finish, newText, panView, pinchView, preview, textBeside, update, type Gesture, type Side, type Tool } from "@/lib/board/gesture";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/board/history";
import { tb } from "@/lib/board/i18n";
import { INK, LABEL_PAD, MUTED, SURFACE, TEXT_SIZE, type BoardElement, type RectElement, type TextElement, type View } from "@/lib/board/model";
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
      return el.text ? tb(lang, "kindRectLabel", { text: el.text.slice(0, 40) }) : tb(lang, "kindRect");
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
  /** Text or a box label being typed; a new text element is only added once it has some. */
  const [editing, setEditing] = React.useState<{ element: TextElement | RectElement; isNew: boolean } | null>(null);
  const [draft, setDraft] = React.useState("");
  /** The element last clicked or moved: Delete removes it, and a box or text gets buttons to add the next one. */
  const [selected, setSelected] = React.useState<string | null>(null);
  /** Set once an edit is finished, so the blur that follows does not finish it again. */
  const editDone = React.useRef(false);
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

  /** Ends the edit and returns the board as it now is. */
  const finishEdit = (value: string): BoardElement[] => {
    if (!editing || editDone.current) return elements;
    editDone.current = true;
    const { element, isNew } = editing;
    setEditing(null);
    const text = value.replace(/\s+$/, "");
    let next = elements;
    if (element.type === "rect") {
      const current = elements.find((el): el is RectElement => el.id === element.id && el.type === "rect");
      if (current && text !== current.text) next = connect(elements.map((el) => (el.id === current.id ? fitLabel({ ...current, text }) : el)));
    } else if (isNew) {
      if (text !== "") next = [...elements, { ...element, text }];
    } else if (text === "") {
      next = elements.filter((el) => el.id !== element.id);
    } else if (text !== element.text) {
      next = elements.map((el) => (el.id === element.id ? { ...element, text } : el));
    }
    if (next !== elements) commitElements(next);
    return next;
  };

  const startEdit = (element: TextElement | RectElement, isNew: boolean) => {
    setGestureBoth(null);
    setTool(null);
    setSelected(element.id);
    setDraft(element.text);
    editDone.current = false;
    setEditing({ element, isNew });
  };

  /** The next box to the right of or below a box, linked by an arrow; or the next column of text. */
  const addBeside = (from: BoardElement[], id: string, side: Side) => {
    const el = from.find((e) => e.id === id);
    if (el?.type === "rect") {
      const made = boxBeside(from, el, side);
      commitElements(made.elements);
      startEdit(made.box, false);
    } else if (el?.type === "text") {
      startEdit(textBeside(el), true);
    }
  };

  const removeSelected = () => {
    if (!selected || !elements.some((el) => el.id === selected)) return;
    setGestureBoth(null);
    commitElements(remove(elements, selected));
    setSelected(null);
  };

  /* -------------------------------------------------------------- pointers */

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 2) return;
    const board = editing ? finishEdit(draft) : elements;
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

    const world = toWorld(view, screen.x, screen.y);
    const reach = event.pointerType === "touch" ? 14 : 6;

    if (tool === "text") {
      const hit = topmostAt(board, world, reach / view.zoom);
      if (hit?.type === "text" || hit?.type === "rect") startEdit(hit, false);
      else startEdit(snap(newText(world), board, SNAP / view.zoom) as TextElement, true);
      event.preventDefault();
      return;
    }
    const next = begin({ tool, elements: board, world, screen, view, reach });
    if (next.kind === "pan") setSelected(null);
    setGestureBoth(next);
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
    setSelected(g.kind === "move" ? g.id : null);
    const edit = done.edit ? done.elements.find((el) => el.id === done.edit) : undefined;
    if (edit?.type === "text" || edit?.type === "rect") startEdit(edit, false);
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
    setSelected(null);
    setHist(undo);
  };
  const doRedo = () => {
    setGestureBoth(null);
    setHist(redo);
  };
  const clear = () => {
    if (elements.length === 0) return;
    setGestureBoth(null);
    setSelected(null);
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
      setSelected(null);
      return setTool(null);
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      return removeSelected();
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

  // While a box's label is typed, the box shows at the size it will grow to, without its old label.
  const editingBox = editing?.element.type === "rect" ? fitLabel({ ...(elements.find((el) => el.id === editing.element.id) as RectElement ?? editing.element), text: draft }) : null;
  const drawnNow = editingBox ? connect(shown.map((el) => (el.id === editingBox.id ? { ...editingBox, text: "" } : el))) : shown.filter((el) => el.id !== editing?.element.id);
  const picked = gesture ? undefined : (editingBox ?? elements.find((el) => el.id === selected));
  const pickedBox = picked ? boundsOf(picked) : null;
  const handles: { side: Side; label: string; at: Point }[] = [];
  if (picked && pickedBox && picked.type !== "arrow") {
    const right = toScreen(view, { x: pickedBox.x + pickedBox.w, y: pickedBox.y + pickedBox.h / 2 });
    handles.push({ side: "right", label: tb(lang, picked.type === "rect" ? "boxRight" : "textRight"), at: { x: right.x + 26, y: right.y } });
    if (picked.type === "rect") {
      const below = toScreen(view, { x: pickedBox.x + pickedBox.w / 2, y: pickedBox.y + pickedBox.h });
      handles.push({ side: "below", label: tb(lang, "boxBelow"), at: { x: below.x, y: below.y + 26 } });
    }
  }
  const editorStyle = (): React.CSSProperties => {
    const font = { fontSize: TEXT_SIZE * view.zoom, lineHeight: 1.25, color: INK, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" };
    if (editingBox) {
      const corner = toScreen(view, editingBox);
      const lines = draft.split("\n").length;
      const padTop = Math.max(0, (editingBox.h - lines * TEXT_SIZE * 1.25) / 2) * view.zoom;
      return { ...font, left: corner.x, top: corner.y, width: editingBox.w * view.zoom, height: editingBox.h * view.zoom, paddingTop: padTop, textAlign: "center", boxSizing: "border-box" };
    }
    const at = toScreen(view, editing!.element);
    return { ...font, left: at.x, top: at.y, minWidth: 80, width: Math.max(120, (textSize(draft).w + TEXT_SIZE) * view.zoom) };
  };
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
            {drawnNow.map((el) => renderNode(describeElement(el), el.id))}
            {pickedBox && !editing && (
              <rect x={pickedBox.x - 10} y={pickedBox.y - 10} width={pickedBox.w + 20} height={pickedBox.h + 20} rx={8} fill="none" stroke={MUTED} strokeWidth={2 / view.zoom} strokeDasharray={`${8 / view.zoom} ${6 / view.zoom}`} />
            )}
          </g>
        </svg>

        {editing && (
          <textarea
            data-board-text=""
            aria-label={tb(lang, "textLabel")}
            title={tb(lang, "textHint")}
            autoFocus
            value={draft}
            rows={Math.max(1, draft.split("\n").length)}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => finishEdit(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                finishEdit(editing.element.text);
                wrapRef.current?.focus({ preventScroll: true });
              } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                finishEdit(event.currentTarget.value);
                wrapRef.current?.focus({ preventScroll: true });
              } else if (event.key === "Tab") {
                // Straight on to the next box or column, as in a table.
                event.preventDefault();
                const id = editing.element.id;
                addBeside(finishEdit(event.currentTarget.value), id, event.shiftKey && editing.element.type === "rect" ? "below" : "right");
              }
            }}
            className={cn("absolute resize-none overflow-hidden bg-transparent p-0 outline-none", !editingBox && "border border-dashed border-(--accent)")}
            style={editorStyle()}
          />
        )}

        {handles.map(({ side, label, at }) => (
          <button
            key={side}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => picked && addBeside(live.current.elements, picked.id, side)}
            className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-(--accent) bg-(--bg) text-(--accent) shadow-sm hover:bg-(--accent)/15 focus-visible:outline-2 focus-visible:outline-(--accent)"
            style={{ left: at.x, top: at.y }}
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        ))}

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
