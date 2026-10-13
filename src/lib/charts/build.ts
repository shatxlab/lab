/**
 * Draws a prepared chart as an SVG string, and describes what the pointer can
 * land on. The same string is shown on the page and saved as the export, so
 * what you see is what you take away. Marks follow one set of specs: 2px lines,
 * bars at most 24px thick with a 4px rounded data end and a 2px gap between
 * neighbours, markers of at least 8px with a surface ring, hairline solid grid,
 * text in ink tokens (never in a series colour), and a legend whenever there are
 * two or more series.
 */

import type { AppLang } from "@/lib/apps/lang";
import type { Palette } from "@/lib/charts/palette";
import type { Prepared, PreparedBars, PreparedHistogram, PreparedLine, PreparedScatter, Series } from "@/lib/charts/prepare";
import { formatCompact, formatDate, formatTick, formatTickNumber, formatValue, niceAxis, timeTicks, type Axis } from "@/lib/charts/scales";

/** The words the chart itself contains, in the reader's language. */
export interface ChartText {
  title: string;
  /** The value axis of a histogram. */
  frequency: string;
  noValue: string;
  /** The row that adds a stack up, in a tooltip. */
  total: string;
  /** "{n} points" for the accessible description. */
  points: (count: number) => string;
}

export interface BuildOptions {
  /** Pixels wide; text keeps its size, so a narrow chart gets fewer ticks and a wrapped legend rather than tiny type. */
  width?: number;
  /** Pixels tall for charts whose height is not set by their rows; defaults by width. */
  height?: number;
  palette: Palette;
  lang: AppLang;
  text: ChartText;
  /** Fill bars and areas with a hatch as well as a colour (print, colour-blind readers). */
  patterns?: boolean;
  /** Line charts: a wash under the line. */
  area?: boolean;
  /** Makes SVG ids unique when several charts share a page. */
  uid?: string;
}

export interface HitRow {
  label: string;
  value: string;
  /** Palette slot of the series, for the colour key. */
  slot: number | null;
}

export interface Hit {
  /** Where the pointer is aimed (x, y) or the band it can be anywhere in (x, y, w, h). */
  x: number;
  y: number;
  w?: number;
  h?: number;
  title: string;
  rows: HitRow[];
  /** Dots to ring while this hit is active. */
  marks: { x: number; y: number; slot: number }[];
}

export interface Scene {
  svg: string;
  width: number;
  height: number;
  title: string;
  description: string;
  /** "x": a crosshair snaps to the nearest x; "band": a rectangle is the target; "point": the nearest dot. */
  hitMode: "x" | "band" | "point";
  hits: Hit[];
  /** The plotted area, so the overlay can draw a crosshair across it. */
  plot: { left: number; top: number; right: number; bottom: number };
  table: { headers: string[]; rows: string[][] };
  notes: string[];
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const WIDTH = 720;
const TICK_SIZE = 11;
const LABEL_SIZE = 11;
const TEXT_WIDTH = 0.56;
const MAX_BAR = 24;
const GAP = 2;

const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r = (value: number): number => Math.round(value * 100) / 100;
const textWidth = (value: string, size: number): number => value.length * size * TEXT_WIDTH;
const clip = (value: string, max: number): string => (value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value);

interface TextOptions {
  size?: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  rotate?: number;
}

function text(x: number, y: number, value: string, options: TextOptions): string {
  const { size = TICK_SIZE, fill, anchor = "start", weight, rotate } = options;
  const transform = rotate ? ` transform="rotate(${rotate} ${r(x)} ${r(y)})"` : "";
  return `<text x="${r(x)}" y="${r(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${weight ? ` font-weight="${weight}"` : ""}${transform}>${esc(value)}</text>`;
}

const line = (x1: number, y1: number, x2: number, y2: number, stroke: string): string =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="1"/>`;

/* --------------------------------------------------------------- chrome */

interface Chrome {
  palette: Palette;
  lang: AppLang;
  text: ChartText;
  uid: string;
  patterns: boolean;
  width: number;
  height: number;
  /** Slots that need a pattern definition. */
  slots: Set<number>;
}

const colour = (c: Chrome, slot: number): string => c.palette.series[slot % c.palette.series.length]!;

/** The fill for bars and areas: the colour, or its hatch. */
function fill(c: Chrome, slot: number): string {
  c.slots.add(slot);
  return c.patterns ? `url(#${c.uid}-p${slot})` : colour(c, slot);
}

function defs(c: Chrome): string {
  if (!c.patterns || c.slots.size === 0) return "";
  const patterns = [...c.slots]
    .sort((a, b) => a - b)
    .map((slot) => {
      const tone = colour(c, slot);
      // 45° and its 135° mirror only, alternating by slot; tone on tone.
      return `<pattern id="${c.uid}-p${slot}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${slot % 2 === 0 ? 45 : 135})"><rect width="6" height="6" fill="${tone}" fill-opacity="0.3"/><line x1="0" y1="0" x2="0" y2="6" stroke="${tone}" stroke-width="2.5"/></pattern>`;
    })
    .join("");
  return `<defs>${patterns}</defs>`;
}

interface Legend {
  svg: string;
  height: number;
}

/** One row of keys per line that fits; a single series needs none, since the title names it. */
function legend(c: Chrome, entries: { name: string; slot: number }[], kind: "line" | "rect", top: number): Legend {
  if (entries.length < 2) return { svg: "", height: 0 };
  const left = 14;
  const limit = c.width - 14;
  let x = left;
  let y = top + 8;
  let svg = "";
  for (const entry of entries) {
    const label = clip(entry.name, 28);
    const w = (kind === "line" ? 22 : 16) + textWidth(label, 12) + 18;
    if (x + w > limit && x > left) {
      x = left;
      y += 20;
    }
    svg +=
      kind === "line"
        ? `<line x1="${x}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="${colour(c, entry.slot)}" stroke-width="2" stroke-linecap="round"/>`
        : `<rect x="${x}" y="${y - 5}" width="10" height="10" rx="2" fill="${fill(c, entry.slot)}"/>`;
    svg += text(x + (kind === "line" ? 20 : 15), y + 4, label, { size: 12, fill: c.palette.secondary });
    x += w;
  }
  return { svg, height: y - top + 14 };
}

function header(c: Chrome, title: string): { svg: string; height: number } {
  if (!title) return { svg: "", height: 14 };
  return { svg: text(14, 25, clip(title, Math.floor((c.width - 28) / (15 * TEXT_WIDTH))), { size: 15, weight: 600, fill: c.palette.ink }), height: 40 };
}

interface Frame {
  parts: string;
  top: number;
}

function frame(c: Chrome, title: string, entries: { name: string; slot: number }[], kind: "line" | "rect"): Frame {
  const head = header(c, title);
  const key = legend(c, entries, kind, head.height);
  return { parts: head.svg + key.svg, top: head.height + key.height + 6 };
}

/* ----------------------------------------------------------------- axes */

interface Plot {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const tickLabelWidth = (axis: Axis, lang: AppLang): number => Math.max(...axis.ticks.map((tick) => textWidth(formatTickNumber(tick, axis.step, lang), TICK_SIZE)));

/** Horizontal gridlines with their value labels on the left; the baseline is the axis colour. */
function valueGrid(c: Chrome, axis: Axis, plot: Plot, y: (value: number) => number): string {
  let svg = "";
  for (const tick of axis.ticks) {
    const py = y(tick);
    const isBase = Math.abs(py - plot.bottom) < 0.5;
    svg += line(plot.left, py, plot.right, py, isBase ? c.palette.axis : c.palette.grid);
    svg += text(plot.left - 8, py + 4, formatTickNumber(tick, axis.step, c.lang), { fill: c.palette.muted, anchor: "end" });
  }
  return svg;
}

const axisName = (c: Chrome, plot: Plot, name: string, y: number): string => text((plot.left + plot.right) / 2, y, clip(name, 60), { fill: c.palette.muted, anchor: "middle" });

function rowsOf(series: Series[], index: number, c: Chrome): HitRow[] {
  return series.map((s) => ({ label: s.name, value: s.values[index] === null || s.values[index] === undefined ? c.text.noValue : formatValue(s.values[index]!, c.lang), slot: s.slot }));
}

/* ------------------------------------------------------------- the root */

function finish(c: Chrome, width: number, height: number, body: string, base: Omit<Scene, "svg" | "width" | "height" | "title" | "description">, title: string, description: string): Scene {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${c.uid}-t ${c.uid}-d" font-family="${FONT}">` +
    `<title id="${c.uid}-t">${esc(title || description)}</title><desc id="${c.uid}-d">${esc(description)}</desc>` +
    defs(c) +
    `<rect width="${width}" height="${height}" fill="${c.palette.surface}"/>` +
    body +
    `</svg>`;
  return { ...base, svg, width, height, title, description };
}

/* ----------------------------------------------------------------- line */

function buildLine(p: PreparedLine, c: Chrome, area: boolean): Scene {
  const { palette, lang } = c;
  const n = p.xs.length;
  const direct = p.series.length <= 4;
  const f = frame(c, c.text.title, p.series, "line");
  const all = p.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const vAxis = niceAxis(all.length ? Math.min(...all) : 0, all.length ? Math.max(...all) : 1, { includeZero: area, count: 5 });
  const height = c.height;
  const bottomBand = 50;
  const plot: Plot = { left: Math.max(36, tickLabelWidth(vAxis, lang) + 16), top: f.top, right: c.width - (direct ? 60 : 16), bottom: height - bottomBand };
  const inset = 8;
  const innerLeft = plot.left + inset;
  const innerWidth = plot.right - plot.left - inset * 2;

  const xMin = n ? Math.min(...p.xs) : 0;
  const xMax = n ? Math.max(...p.xs) : 1;
  const span = xMax - xMin || 1;
  const x = (value: number): number => (n === 1 || xMax === xMin ? innerLeft + innerWidth / 2 : innerLeft + ((value - xMin) / span) * innerWidth);
  const y = (value: number): number => plot.bottom - ((value - vAxis.min) / (vAxis.max - vAxis.min)) * (plot.bottom - plot.top);

  let body = f.parts + valueGrid(c, vAxis, plot, y);

  // The horizontal axis.
  const maxTicks = Math.max(2, Math.floor(innerWidth / 90));
  if (p.xKind === "time") {
    const axis = timeTicks(xMin, xMax, maxTicks);
    const spansYears = new Date(xMin).getUTCFullYear() !== new Date(xMax).getUTCFullYear();
    for (const tick of axis.ticks) body += text(x(tick), plot.bottom + 18, formatTick(tick, axis, lang, spansYears), { fill: palette.muted, anchor: "middle" });
  } else if (p.xKind === "number") {
    const axis = niceAxis(xMin, xMax, { count: maxTicks });
    for (const tick of axis.ticks) if (tick >= xMin - 1e-9 && tick <= xMax + 1e-9) body += text(x(tick), plot.bottom + 18, formatTickNumber(tick, axis.step, lang), { fill: palette.muted, anchor: "middle" });
  } else {
    const labels = p.xLabels.map((label) => clip(label, 12));
    const widest = Math.max(...labels.map((label) => textWidth(label, TICK_SIZE)), 1);
    const every = Math.max(1, Math.ceil((widest + 12) / (n > 1 ? innerWidth / (n - 1) : innerWidth)));
    labels.forEach((label, i) => {
      if (i % every === 0) body += text(x(p.xs[i]!), plot.bottom + 18, label, { fill: palette.muted, anchor: "middle" });
    });
  }
  body += axisName(c, plot, p.xName, height - 10);

  // Marks: areas first so lines sit on top.
  for (const s of p.series) {
    const segments: string[][] = [];
    let current: string[] = [];
    s.values.forEach((value, i) => {
      if (value === null) {
        if (current.length) segments.push(current);
        current = [];
      } else current.push(`${r(x(p.xs[i]!))} ${r(y(value))}`);
    });
    if (current.length) segments.push(current);
    if (area) {
      for (const seg of segments) {
        const baseline = r(y(Math.max(vAxis.min, Math.min(vAxis.max, 0))));
        const first = seg[0]!.split(" ")[0];
        const last = seg[seg.length - 1]!.split(" ")[0];
        body += `<path d="M${first} ${baseline} L${seg.join(" L")} L${last} ${baseline} Z" fill="${fill(c, s.slot)}" fill-opacity="${c.patterns ? 0.9 : 0.1}"/>`;
      }
    }
  }
  for (const s of p.series) {
    let d = "";
    let pen = false;
    s.values.forEach((value, i) => {
      if (value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${r(x(p.xs[i]!))} ${r(y(value))} `;
      pen = true;
    });
    if (d) body += `<path d="${d.trim()}" fill="none" stroke="${colour(c, s.slot)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    // Dots with a surface ring when there are few enough to count.
    if (n <= 40) {
      s.values.forEach((value, i) => {
        if (value !== null) body += `<circle cx="${r(x(p.xs[i]!))}" cy="${r(y(value))}" r="4" fill="${colour(c, s.slot)}" stroke="${palette.surface}" stroke-width="2"/>`;
      });
    }
  }

  // The end of each line wears its value, unless two would collide.
  if (direct) {
    const ends = p.series
      .map((s) => {
        let last = s.values.length - 1;
        while (last >= 0 && s.values[last] === null) last -= 1;
        return last >= 0 ? { value: s.values[last]!, py: y(s.values[last]!), px: x(p.xs[last]!) } : null;
      })
      .filter((end): end is { value: number; py: number; px: number } => end !== null)
      .sort((a, b) => a.py - b.py);
    let lastY = -Infinity;
    for (const end of ends) {
      if (end.py - lastY < 13) continue;
      lastY = end.py;
      body += text(end.px + 9, end.py + 4, Math.abs(end.value) >= 10000 ? formatCompact(end.value, lang) : formatValue(end.value, lang), { size: LABEL_SIZE, fill: palette.ink });
    }
  }

  const label = (i: number): string => (p.xKind === "time" ? formatDate(p.xs[i]!, lang) : p.xKind === "number" ? formatValue(p.xs[i]!, lang) : p.xLabels[i]!);
  const hits: Hit[] = p.xs.map((value, i) => ({
    x: x(value),
    y: plot.top,
    title: label(i),
    rows: rowsOf(p.series, i, c),
    marks: p.series.flatMap((s) => (s.values[i] === null ? [] : [{ x: x(value), y: y(s.values[i]!), slot: s.slot }])),
  }));

  const notes = p.thinned > 0 ? [`${p.thinned}`] : [];
  return finish(
    c,
    c.width,
    height,
    body,
    {
      hitMode: "x",
      hits,
      plot,
      table: { headers: [p.xName, ...p.series.map((s) => s.name)], rows: p.xs.map((_, i) => [label(i), ...p.series.map((s) => (s.values[i] === null ? "" : formatValue(s.values[i]!, lang)))]) },
      notes,
    },
    c.text.title,
    `${c.text.title}. ${p.series.map((s) => s.name).join(", ")}. ${c.text.points(n)}.`,
  );
}

/* ----------------------------------------------------------------- bars */

/** A bar with only its data end rounded: it grows from a square baseline. `dir` is where the data end points. */
function barPath(x: number, y: number, w: number, h: number, dir: "up" | "down" | "left" | "right"): string {
  const rad = Math.min(4, w / 2, h / 2, dir === "up" || dir === "down" ? h : w);
  const [x0, y0, x1, y1] = [r(x), r(y), r(x + w), r(y + h)];
  const k = r(rad);
  switch (dir) {
    case "up":
      return `M${x0} ${y1}V${r(y0 + rad)}Q${x0} ${y0} ${r(x0 + k)} ${y0}H${r(x1 - k)}Q${x1} ${y0} ${x1} ${r(y0 + k)}V${y1}Z`;
    case "down":
      return `M${x0} ${y0}V${r(y1 - k)}Q${x0} ${y1} ${r(x0 + k)} ${y1}H${r(x1 - k)}Q${x1} ${y1} ${x1} ${r(y1 - k)}V${y0}Z`;
    case "right":
      return `M${x0} ${y0}H${r(x1 - k)}Q${x1} ${y0} ${x1} ${r(y0 + k)}V${r(y1 - k)}Q${x1} ${y1} ${r(x1 - k)} ${y1}H${x0}Z`;
    default:
      return `M${x1} ${y0}H${r(x0 + k)}Q${x0} ${y0} ${x0} ${r(y0 + k)}V${r(y1 - k)}Q${x0} ${y1} ${r(x0 + k)} ${y1}H${x1}Z`;
  }
}

interface Segment {
  slot: number;
  from: number;
  to: number;
  /** The segment at the open end of its stack: the only one with a rounded end. */
  last: boolean;
}

/** One category's stack: positive values build up from zero, negative ones down from it. */
export function stackSegments(values: (number | null | undefined)[], slots: number[]): { segments: Segment[]; high: number; low: number } {
  const segments: Segment[] = [];
  let high = 0;
  let low = 0;
  let lastUp = -1;
  let lastDown = -1;
  values.forEach((value, j) => {
    if (value === null || value === undefined || value === 0) return;
    if (value > 0) {
      segments.push({ slot: slots[j]!, from: high, to: high + value, last: false });
      high += value;
      lastUp = segments.length - 1;
    } else {
      segments.push({ slot: slots[j]!, from: low, to: low + value, last: false });
      low += value;
      lastDown = segments.length - 1;
    }
  });
  if (lastUp >= 0) segments[lastUp]!.last = true;
  if (lastDown >= 0) segments[lastDown]!.last = true;
  return { segments, high, low };
}

function buildBars(p: PreparedBars, c: Chrome): Scene {
  const { palette, lang } = c;
  const n = p.categories.length;
  const m = p.series.length;
  const f = frame(c, c.text.title, p.series, "rect");
  const all = p.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const slots = p.series.map((s) => s.slot);
  const stacks = p.categories.map((_, i) => stackSegments(p.series.map((s) => s.values[i]), slots));
  // A stack's reach is the sum of its parts, not its biggest part.
  const lo = p.stacked ? Math.min(0, ...stacks.map((stack) => stack.low)) : all.length ? Math.min(...all) : 0;
  const hi = p.stacked ? Math.max(0, ...stacks.map((stack) => stack.high)) : all.length ? Math.max(...all) : 1;
  const vAxis = niceAxis(lo, hi === lo ? lo + 1 : hi, { includeZero: true, count: 5 });
  const lanes = p.stacked ? 1 : m;
  const showAll = p.stacked ? n <= 8 : n * m <= 8;
  const maxValue = all.length ? Math.max(...all) : 0;
  const hitRows = (i: number): HitRow[] => {
    const rows = rowsOf(p.series, i, c).map((row, j) => ({ ...row, slot: p.series[j]!.slot }));
    if (!p.stacked) return rows;
    const total = stacks[i]!.high + stacks[i]!.low;
    return [...rows, { label: c.text.total, value: formatValue(total, lang), slot: null }];
  };

  let body = f.parts;
  const hits: Hit[] = [];
  let plot: Plot;
  let height: number;

  if (!p.horizontal) {
    const labelLimit = 14;
    const labels = p.categories.map((category) => clip(category, labelLimit));
    height = c.height;
    const left = Math.max(36, tickLabelWidth(vAxis, lang) + 16);
    const right = c.width - 16;
    const band = (right - left) / Math.max(1, n);
    const rotate = Math.max(...labels.map((label) => textWidth(label, TICK_SIZE)), 0) + 8 > band;
    const bottomBand = rotate ? 70 : 50;
    plot = { left, top: f.top, right, bottom: height - bottomBand };
    const y = (value: number): number => plot.bottom - ((value - vAxis.min) / (vAxis.max - vAxis.min)) * (plot.bottom - plot.top);
    body += valueGrid(c, vAxis, plot, y);
    const thick = Math.max(3, Math.min(MAX_BAR, Math.floor((band * 0.8 - (lanes - 1) * GAP) / lanes)));
    const group = lanes * thick + (lanes - 1) * GAP;
    const zero = y(0);

    p.categories.forEach((category, i) => {
      const bandLeft = plot.left + i * band;
      const start = bandLeft + (band - group) / 2;
      body += rotate
        ? text(bandLeft + band / 2 + 4, plot.bottom + 14, labels[i]!, { fill: palette.muted, anchor: "end", rotate: -35 })
        : text(bandLeft + band / 2, plot.bottom + 18, labels[i]!, { fill: palette.muted, anchor: "middle" });
      if (p.stacked) {
        const stack = stacks[i]!;
        for (const seg of stack.segments) {
          const up = seg.to > seg.from;
          // A 2px surface gap between segments: trim the edges that touch another one.
          let top = Math.min(y(seg.from), y(seg.to));
          let bottom = Math.max(y(seg.from), y(seg.to));
          if (up) {
            if (!seg.last) top += GAP / 2;
            if (seg.from !== 0) bottom -= GAP / 2;
          } else {
            if (seg.from !== 0) top += GAP / 2;
            if (!seg.last) bottom -= GAP / 2;
          }
          const h = Math.max(1, bottom - top);
          body += seg.last
            ? `<path d="${barPath(start, top, thick, h, up ? "up" : "down")}" fill="${fill(c, seg.slot)}"/>`
            : `<rect x="${r(start)}" y="${r(top)}" width="${r(thick)}" height="${r(h)}" fill="${fill(c, seg.slot)}"/>`;
        }
        if (showAll && stack.segments.length > 0) {
          const total = stack.high + stack.low;
          const ty = stack.high > 0 ? y(stack.high) - 6 : y(stack.low) + 14;
          if (ty > plot.top - 4 && ty < plot.bottom + 16) body += text(start + thick / 2, ty, formatCompact(total, lang), { size: LABEL_SIZE, fill: palette.ink, anchor: "middle" });
        }
      } else
      p.series.forEach((s, j) => {
        const value = s.values[i];
        if (value === null || value === undefined || value === 0) return;
        const top = y(value);
        const bx = start + j * (thick + GAP);
        body += `<path d="${barPath(bx, Math.min(top, zero), thick, Math.abs(top - zero), value > 0 ? "up" : "down")}" fill="${fill(c, s.slot)}"/>`;
        if (showAll || (value === maxValue && m === 1)) {
          const ty = value > 0 ? top - 6 : top + 14;
          if (ty > plot.top - 4 && ty < plot.bottom + 16) body += text(bx + thick / 2, ty, formatCompact(value, lang), { size: LABEL_SIZE, fill: palette.ink, anchor: "middle" });
        }
      });
      hits.push({ x: bandLeft, y: plot.top, w: band, h: plot.bottom - plot.top, title: category || "—", rows: hitRows(i), marks: [] });
    });
    body += axisName(c, plot, p.xName, height - 10);
  } else {
    const labelLimit = 24;
    const labels = p.categories.map((category) => clip(category, labelLimit));
    const rowH = Math.max(lanes > 1 ? lanes * 16 + 10 : 26, 22);
    const left = Math.min(200, Math.max(...labels.map((label) => textWidth(label, TICK_SIZE)), 24) + 18);
    const right = c.width - 24;
    const plotHeight = Math.min(900, Math.max(160, n * rowH));
    height = f.top + plotHeight + 50;
    plot = { left, top: f.top, right, bottom: f.top + plotHeight };
    const band = plotHeight / Math.max(1, n);
    const xs = (value: number): number => plot.left + ((value - vAxis.min) / (vAxis.max - vAxis.min)) * (plot.right - plot.left);
    // Vertical gridlines with value labels below.
    for (const tick of vAxis.ticks) {
      const px = xs(tick);
      body += line(px, plot.top, px, plot.bottom, Math.abs(px - xs(0)) < 0.5 ? palette.axis : palette.grid);
      body += text(px, plot.bottom + 18, formatTickNumber(tick, vAxis.step, lang), { fill: palette.muted, anchor: "middle" });
    }
    const thick = Math.max(3, Math.min(MAX_BAR, Math.floor((band * 0.8 - (lanes - 1) * GAP) / lanes)));
    const group = lanes * thick + (lanes - 1) * GAP;
    const zero = xs(0);
    p.categories.forEach((category, i) => {
      const bandTop = plot.top + i * band;
      const start = bandTop + (band - group) / 2;
      body += text(plot.left - 8, bandTop + band / 2 + 4, labels[i]!, { fill: palette.muted, anchor: "end" });
      if (p.stacked) {
        const stack = stacks[i]!;
        for (const seg of stack.segments) {
          const right = seg.to > seg.from;
          let left = Math.min(xs(seg.from), xs(seg.to));
          let rightEdge = Math.max(xs(seg.from), xs(seg.to));
          if (right) {
            if (seg.from !== 0) left += GAP / 2;
            if (!seg.last) rightEdge -= GAP / 2;
          } else {
            if (!seg.last) left += GAP / 2;
            if (seg.from !== 0) rightEdge -= GAP / 2;
          }
          const w = Math.max(1, rightEdge - left);
          body += seg.last
            ? `<path d="${barPath(left, start, w, thick, right ? "right" : "left")}" fill="${fill(c, seg.slot)}"/>`
            : `<rect x="${r(left)}" y="${r(start)}" width="${r(w)}" height="${r(thick)}" fill="${fill(c, seg.slot)}"/>`;
        }
        if (showAll && stack.segments.length > 0) {
          const total = stack.high + stack.low;
          const label = formatCompact(total, lang);
          const end = stack.high > 0 ? xs(stack.high) : xs(stack.low);
          const room = stack.high > 0 ? plot.right - end : end - plot.left;
          if (room > textWidth(label, LABEL_SIZE) + 10) body += text(stack.high > 0 ? end + 6 : end - 6, start + thick / 2 + 4, label, { size: LABEL_SIZE, fill: palette.ink, anchor: stack.high > 0 ? "start" : "end" });
        }
      } else
      p.series.forEach((s, j) => {
        const value = s.values[i];
        if (value === null || value === undefined || value === 0) return;
        const end = xs(value);
        const by = start + j * (thick + GAP);
        body += `<path d="${barPath(Math.min(end, zero), by, Math.abs(end - zero), thick, value > 0 ? "right" : "left")}" fill="${fill(c, s.slot)}"/>`;
        if (showAll || (value === maxValue && m === 1)) {
          const label = formatCompact(value, lang);
          const room = value > 0 ? plot.right - end : end - plot.left;
          if (room > textWidth(label, LABEL_SIZE) + 10) body += text(value > 0 ? end + 6 : end - 6, by + thick / 2 + 4, label, { size: LABEL_SIZE, fill: palette.ink, anchor: value > 0 ? "start" : "end" });
        }
      });
      hits.push({ x: plot.left, y: bandTop, w: plot.right - plot.left, h: band, title: category || "—", rows: hitRows(i), marks: [] });
    });
    body += axisName(c, plot, p.xName, height - 10);
  }

  const notes = p.omitted > 0 ? [`${p.omitted}`] : [];
  return finish(
    c,
    c.width,
    height,
    body,
    {
      hitMode: "band",
      hits,
      plot,
      table: { headers: [p.xName, ...p.series.map((s) => s.name)], rows: p.categories.map((category, i) => [category, ...p.series.map((s) => (s.values[i] === null ? "" : formatValue(s.values[i]!, lang)))]) },
      notes,
    },
    c.text.title,
    `${c.text.title}. ${p.series.map((s) => s.name).join(", ")}. ${c.text.points(n)}.`,
  );
}

/* ------------------------------------------------------------ histogram */

function buildHistogram(p: PreparedHistogram, c: Chrome): Scene {
  const { palette, lang } = c;
  const f = frame(c, c.text.title, [], "rect");
  const edgeMin = p.bins.length ? p.bins[0]!.from : 0;
  const edgeMax = p.bins.length ? p.bins[p.bins.length - 1]!.to : 1;
  const top = Math.max(0, ...p.bins.map((bin) => bin.count));
  const vAxis = niceAxis(0, top || 1, { includeZero: true, count: 5 });
  const height = c.height;
  const plot: Plot = { left: Math.max(36, tickLabelWidth(vAxis, lang) + 16), top: f.top, right: c.width - 16, bottom: height - 50 };
  const span = edgeMax - edgeMin || 1;
  const x = (value: number): number => plot.left + ((value - edgeMin) / span) * (plot.right - plot.left);
  const y = (value: number): number => plot.bottom - ((value - vAxis.min) / (vAxis.max - vAxis.min)) * (plot.bottom - plot.top);

  let body = f.parts + valueGrid(c, vAxis, plot, y);
  const xAxis = niceAxis(edgeMin, edgeMax, { count: Math.max(2, Math.floor((plot.right - plot.left) / 80)) });
  for (const tick of xAxis.ticks) if (tick >= edgeMin - 1e-9 && tick <= edgeMax + 1e-9) body += text(x(tick), plot.bottom + 18, formatTickNumber(tick, xAxis.step, lang), { fill: palette.muted, anchor: "middle" });
  body += axisName(c, plot, p.name, height - 10);

  const hits: Hit[] = [];
  const rangeLabel = (from: number, to: number): string => `${formatValue(from, lang)}–${formatValue(to, lang)}`;
  p.bins.forEach((bin) => {
    const x1 = x(bin.from);
    const x2 = x(bin.to);
    if (bin.count > 0) {
      const barTop = y(bin.count);
      body += `<path d="${barPath(x1 + GAP / 2, barTop, Math.max(1, x2 - x1 - GAP), plot.bottom - barTop, "up")}" fill="${fill(c, p.slot)}"/>`;
      // Only the tallest bin is labelled; the axis and tooltip carry the rest.
      if (bin.count === top) body += text((x1 + x2) / 2, barTop - 6, formatValue(bin.count, lang), { size: LABEL_SIZE, fill: palette.ink, anchor: "middle" });
    }
    hits.push({ x: x1, y: plot.top, w: x2 - x1, h: plot.bottom - plot.top, title: rangeLabel(bin.from, bin.to), rows: [{ label: c.text.frequency, value: formatValue(bin.count, lang), slot: p.slot }], marks: [] });
  });

  return finish(
    c,
    c.width,
    height,
    body,
    {
      hitMode: "band",
      hits,
      plot,
      table: { headers: [p.name, c.text.frequency], rows: p.bins.map((bin) => [rangeLabel(bin.from, bin.to), formatValue(bin.count, lang)]) },
      notes: [],
    },
    c.text.title,
    `${c.text.title}. ${c.text.points(p.total)}.`,
  );
}

/* -------------------------------------------------------------- scatter */

function buildScatter(p: PreparedScatter, c: Chrome): Scene {
  const { palette, lang } = c;
  const f = frame(c, c.text.title, p.series, "rect");
  const ys = p.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const vAxis = niceAxis(ys.length ? Math.min(...ys) : 0, ys.length ? Math.max(...ys) : 1, { count: 5 });
  const height = c.height;
  const plot: Plot = { left: Math.max(36, tickLabelWidth(vAxis, lang) + 16), top: f.top, right: c.width - 20, bottom: height - 50 };
  const hAxis = niceAxis(p.xs.length ? Math.min(...p.xs) : 0, p.xs.length ? Math.max(...p.xs) : 1, { count: Math.max(2, Math.floor((plot.right - plot.left) / 80)) });
  const x = (value: number): number => plot.left + ((value - hAxis.min) / (hAxis.max - hAxis.min)) * (plot.right - plot.left);
  const y = (value: number): number => plot.bottom - ((value - vAxis.min) / (vAxis.max - vAxis.min)) * (plot.bottom - plot.top);

  let body = f.parts + valueGrid(c, vAxis, plot, y);
  for (const tick of hAxis.ticks) body += text(x(tick), plot.bottom + 18, formatTickNumber(tick, hAxis.step, lang), { fill: palette.muted, anchor: "middle" });
  body += axisName(c, plot, p.xName, height - 10);

  const dense = p.xs.length * p.series.length > 300;
  const hits: Hit[] = [];
  p.xs.forEach((xv, i) => {
    const present = p.series.filter((s) => s.values[i] !== null);
    if (present.length === 0) return;
    for (const s of present) {
      body += `<circle cx="${r(x(xv))}" cy="${r(y(s.values[i]!))}" r="4" fill="${colour(c, s.slot)}" fill-opacity="${dense ? 0.65 : 0.9}" stroke="${palette.surface}" stroke-width="${dense ? 1 : 2}"/>`;
      hits.push({
        x: x(xv),
        y: y(s.values[i]!),
        title: `${p.xName}: ${formatValue(xv, lang)}`,
        rows: [{ label: s.name, value: formatValue(s.values[i]!, lang), slot: s.slot }],
        marks: [{ x: x(xv), y: y(s.values[i]!), slot: s.slot }],
      });
    }
  });

  return finish(
    c,
    c.width,
    height,
    body,
    {
      hitMode: "point",
      hits,
      plot,
      table: { headers: [p.xName, ...p.series.map((s) => s.name)], rows: p.xs.map((xv, i) => [formatValue(xv, lang), ...p.series.map((s) => (s.values[i] === null ? "" : formatValue(s.values[i]!, lang)))]) },
      notes: [],
    },
    c.text.title,
    `${c.text.title}. ${p.series.map((s) => s.name).join(", ")}. ${c.text.points(p.xs.length)}.`,
  );
}

/* ---------------------------------------------------------------- entry */

export function buildChart(prepared: Prepared, options: BuildOptions): Scene {
  const c: Chrome = {
    palette: options.palette,
    lang: options.lang,
    text: options.text,
    uid: options.uid ?? "ch",
    patterns: options.patterns ?? false,
    width: options.width ?? WIDTH,
    height: options.height ?? ((options.width ?? WIDTH) < 520 ? 300 : 380),
    slots: new Set(),
  };
  switch (prepared.type) {
    case "line":
      return buildLine(prepared, c, options.area ?? false);
    case "histogram":
      return buildHistogram(prepared, c);
    case "scatter":
      return buildScatter(prepared, c);
    default:
      return buildBars(prepared, c);
  }
}
