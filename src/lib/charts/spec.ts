/**
 * What a chart is made of, and the guess at it. A spec names columns (by their
 * position in `Table.columns`) and a type; `suggestSpec` reads the shape of the
 * data — a date column first means a line, a few labels and numbers means bars,
 * two numbers means a scatter, and a label column that splits the rows into a few
 * groups becomes the series — and `normalizeSpec` keeps any hand-made choice
 * valid, so the pickers can never produce a chart that cannot be drawn.
 */

import type { Column, Table } from "@/lib/charts/data";

export type ChartType = "line" | "bar" | "grouped" | "histogram" | "scatter";
export const CHART_TYPES: readonly ChartType[] = ["line", "bar", "grouped", "histogram", "scatter"];
export type Aggregate = "none" | "sum" | "mean" | "count";

export interface ChartSpec {
  type: ChartType;
  /** Column position for the horizontal axis; null for a histogram. */
  x: number | null;
  /** Column positions plotted; empty only for a bar chart that counts rows. */
  y: number[];
  /** Line charts: fill under the line. */
  area: boolean;
  /** Histogram: number of bins; null picks one from the data. */
  bins: number | null;
  /** Bar charts: how rows with the same label are combined. */
  aggregate: Aggregate;
  /** Bar charts: bars lying down; null decides from the labels. */
  horizontal: boolean | null;
  /** Bar charts with several series: stack them instead of placing them side by side. */
  stacked: boolean;
  /**
   * Line and bar charts: a text column whose values become the series (a pivot):
   * `Month, Region, Sales` split by Region draws one series per region. Then there
   * is one measure at most, and rows with the same label and group are combined.
   */
  splitBy: number | null;
}

/** The palette has eight colour slots; the fewer series, the clearer the chart. */
export const MAX_SERIES = 6;
export const MAX_SCATTER_SERIES = 3;
export const MAX_CATEGORIES = 40;
export const SLOT_COUNT = 8;

const positionsOf = (table: Table, kind: Column["kind"]): number[] =>
  table.columns.flatMap((column, position) => (column.kind === kind ? [position] : []));

export const numericColumns = (table: Table): number[] => positionsOf(table, "number");

/**
 * The colour a numeric column always wears: its place among the table's numeric
 * columns. It never depends on which series are switched on, so hiding one never
 * repaints the rest. Only the first eight numeric columns can be plotted.
 */
export function slotOf(table: Table, position: number): number | null {
  const slot = numericColumns(table).indexOf(position);
  return slot >= 0 && slot < SLOT_COUNT ? slot : null;
}

/** The numeric columns that can be plotted as a series (those with a colour). */
export const plottableColumns = (table: Table): number[] => numericColumns(table).slice(0, SLOT_COUNT);

/** Which chart types the data can support at all. */
export function availableTypes(table: Table): ChartType[] {
  const numeric = plottableColumns(table).length;
  const labels = table.columns.length;
  const types: ChartType[] = [];
  if (labels >= 1 && numeric >= 1 && table.columns.length >= 2) types.push("line", "bar");
  if (numeric >= 2 && labels >= 3) types.push("grouped");
  if (numeric >= 1) types.push("histogram");
  if (numeric >= 2) types.push("scatter");
  // Counting rows per label works with no numbers at all.
  if (!types.includes("bar") && table.columns.some((column) => column.kind === "text")) types.push("bar");
  return CHART_TYPES.filter((type) => types.includes(type));
}

function strictlyIncreasing(values: (number | null)[]): boolean {
  let last = -Infinity;
  for (const value of values) {
    if (value === null || value <= last) return false;
    last = value;
  }
  return values.length >= 3;
}

const hasDuplicates = (labels: string[]): boolean => new Set(labels).size < labels.length;

/** The most likely chart for this data, or null when nothing in it can be drawn. */
export function suggestSpec(table: Table): ChartSpec | null {
  const numeric = plottableColumns(table);
  const dates = positionsOf(table, "date");
  const texts = positionsOf(table, "text");
  const base: Omit<ChartSpec, "type" | "x" | "y"> = { area: false, bins: null, aggregate: "none", horizontal: null, stacked: false, splitBy: null };

  if (dates.length > 0 && numeric.length > 0) {
    const split = suggestSplit(table, dates[0]!);
    if (split !== null) return { ...base, type: "line", x: dates[0]!, y: [numeric[0]!], splitBy: split, aggregate: "sum" };
    return { ...base, type: "line", x: dates[0]!, y: numeric.slice(0, MAX_SERIES) };
  }
  if (texts.length > 0 && numeric.length > 0) {
    const x = texts[0]!;
    const split = suggestSplit(table, x);
    if (split !== null) return { ...base, type: "grouped", x, y: [numeric[0]!], splitBy: split, aggregate: "sum" };
    const y = numeric.slice(0, numeric.length === 1 ? 1 : 4);
    return {
      ...base,
      type: y.length === 1 ? "bar" : "grouped",
      x,
      y,
      aggregate: hasDuplicates(table.columns[x]!.labels) ? "sum" : "none",
    };
  }
  if (numeric.length >= 2) {
    const first = table.columns[numeric[0]!]!;
    return strictlyIncreasing(first.numbers)
      ? { ...base, type: "line", x: numeric[0]!, y: numeric.slice(1, 1 + MAX_SERIES) }
      : { ...base, type: "scatter", x: numeric[0]!, y: [numeric[1]!] };
  }
  if (numeric.length === 1) return { ...base, type: "histogram", x: null, y: [numeric[0]!] };
  if (texts.length > 0) return { ...base, type: "bar", x: texts[0]!, y: [], aggregate: "count" };
  return null;
}

/** How many distinct groups a split column may have and still be worth splitting on. */
export const MAX_SPLIT_GROUPS = 12;

/** Text columns that could split the rows into series. */
export function splitCandidates(table: Table, x: number | null): number[] {
  return table.columns.flatMap((column, position) => {
    if (position === x || column.kind !== "text") return [];
    const groups = new Set(column.labels).size;
    return groups >= 2 && groups <= table.rowCount ? [position] : [];
  });
}

/**
 * Long data: the label repeats, and a second text column tells the rows apart
 * (`Month, Region, Sales`). Returns that column when the rows are mostly one per
 * label and group, which is what separates it from a coincidental text column.
 */
function suggestSplit(table: Table, x: number): number | null {
  const labels = table.columns[x]!.labels;
  if (!hasDuplicates(labels)) return null;
  for (const position of splitCandidates(table, x)) {
    const groups = table.columns[position]!.labels;
    const distinct = new Set(groups).size;
    if (distinct < 2 || distinct > MAX_SERIES) continue;
    const pairs = new Set(labels.map((label, row) => `${label}\u0000${groups[row]}`)).size;
    if (pairs >= labels.length * 0.8) return position;
  }
  return null;
}

const unique = (values: number[]): number[] => [...new Set(values)];

/** Repair a spec against the table: valid columns, sensible series counts, a type that matches the series. */
export function normalizeSpec(table: Table, input: ChartSpec): ChartSpec {
  const plottable = plottableColumns(table);
  const valid = (position: number | null): position is number => position !== null && position >= 0 && position < table.columns.length;
  const spec: ChartSpec = { ...input, y: unique(input.y).filter((position) => plottable.includes(position)) };
  spec.bins = spec.bins === null ? null : Math.min(60, Math.max(3, Math.round(spec.bins)));

  if (spec.type === "histogram") {
    return { ...spec, x: null, y: spec.y.slice(0, 1).length ? spec.y.slice(0, 1) : plottable.slice(0, 1), aggregate: "none", area: false, stacked: false, splitBy: null };
  }

  if (spec.type === "scatter") {
    const x = valid(spec.x) && plottable.includes(spec.x) ? spec.x : (plottable[0] ?? null);
    const y = spec.y.filter((position) => position !== x).slice(0, MAX_SCATTER_SERIES);
    const fallback = plottable.find((position) => position !== x);
    return { ...spec, x, y: y.length ? y : fallback === undefined ? [] : [fallback], aggregate: "none", area: false, stacked: false, splitBy: null };
  }

  // Line, bar and grouped share a label column.
  const firstLabel = table.columns.findIndex((column) => column.kind !== "number");
  const x = valid(spec.x) ? spec.x : firstLabel >= 0 ? firstLabel : 0;
  const splitBy = spec.splitBy !== null && splitCandidates(table, x).includes(spec.splitBy) ? spec.splitBy : null;
  let y = spec.y.filter((position) => position !== x);
  // A split chart shows one measure (or counts rows), so the series are the groups.
  if (splitBy !== null) y = y.slice(0, 1);
  if (y.length === 0 && spec.aggregate !== "count") {
    const first = plottable.find((position) => position !== x);
    if (first !== undefined) y = [first];
  }

  if (spec.type === "line") {
    const aggregate: Aggregate = splitBy === null ? "none" : spec.aggregate === "none" ? "sum" : spec.aggregate;
    return { ...spec, x, y: y.slice(0, MAX_SERIES), aggregate, splitBy, stacked: false };
  }

  // Bars: one series is a bar chart, several are grouped.
  y = y.slice(0, spec.type === "bar" && input.type === "bar" && y.length > 0 ? Math.max(1, Math.min(y.length, MAX_SERIES)) : MAX_SERIES);
  const several = y.length > 1 || splitBy !== null;
  const type: ChartType = several ? "grouped" : "bar";
  let aggregate: Aggregate = y.length === 0 ? "count" : spec.aggregate === "count" ? "sum" : spec.aggregate;
  if (splitBy !== null) aggregate = spec.aggregate === "none" ? "sum" : spec.aggregate;
  if (splitBy !== null && y.length === 0) aggregate = "count";
  return { ...spec, type, x, y, aggregate, splitBy, stacked: several && spec.stacked, area: false };
}
