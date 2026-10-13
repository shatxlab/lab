/**
 * From a table and a spec to the numbers a chart draws: sorted and thinned
 * lines, aggregated bars, histogram bins, scatter points. No drawing here.
 */

import type { Column, Table } from "@/lib/charts/data";
import { niceStep } from "@/lib/charts/scales";
import { MAX_CATEGORIES, slotOf, type ChartSpec } from "@/lib/charts/spec";

export interface Series {
  /** Position of the column in the table (stable, so colours do not move). */
  column: number;
  name: string;
  slot: number;
  values: (number | null)[];
}

export interface PreparedLine {
  type: "line";
  xName: string;
  xKind: "time" | "number" | "category";
  /** Timestamps (ms), numbers, or 0..n-1 positions for categories. */
  xs: number[];
  xLabels: string[];
  series: Series[];
  /** Rows dropped by thinning a very long series. */
  thinned: number;
}

export interface PreparedBars {
  type: "bar";
  xName: string;
  categories: string[];
  series: Series[];
  horizontal: boolean;
  /** Categories beyond the limit that were left out. */
  omitted: number;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

export interface PreparedHistogram {
  type: "histogram";
  name: string;
  slot: number;
  bins: Bin[];
  total: number;
}

export interface PreparedScatter {
  type: "scatter";
  xName: string;
  xs: number[];
  series: Series[];
}

export type Prepared = PreparedLine | PreparedBars | PreparedHistogram | PreparedScatter;

/** Longest line the eye can follow; beyond this, every k-th point (and the last) is plotted. */
export const MAX_LINE_POINTS = 1500;
const BLANK = "";

const seriesOf = (table: Table, position: number, values: (number | null)[]): Series => ({
  column: position,
  name: table.columns[position]!.name,
  slot: slotOf(table, position) ?? 0,
  values,
});

function xValueOf(column: Column, row: number): number | null {
  return column.kind === "date" ? column.times[row]! : column.kind === "number" ? column.numbers[row]! : row;
}

function prepareLine(table: Table, spec: ChartSpec): PreparedLine {
  const xColumn = table.columns[spec.x!]!;
  const kind = xColumn.kind === "date" ? "time" : xColumn.kind === "number" ? "number" : "category";
  let rows = Array.from({ length: table.rowCount }, (_, row) => row).filter((row) => xValueOf(xColumn, row) !== null);
  // Time and number axes read left to right whatever order the sheet is in.
  if (kind !== "category") rows = rows.sort((a, b) => xValueOf(xColumn, a)! - xValueOf(xColumn, b)! || a - b);

  let thinned = 0;
  if (rows.length > MAX_LINE_POINTS) {
    const every = Math.ceil(rows.length / MAX_LINE_POINTS);
    const kept = rows.filter((_, i) => i % every === 0);
    if (kept[kept.length - 1] !== rows[rows.length - 1]) kept.push(rows[rows.length - 1]!);
    thinned = rows.length - kept.length;
    rows = kept;
  }

  return {
    type: "line",
    xName: xColumn.name,
    xKind: kind,
    xs: kind === "category" ? rows.map((_, i) => i) : rows.map((row) => xValueOf(xColumn, row)!),
    xLabels: rows.map((row) => xColumn.labels[row]!),
    series: spec.y.map((position) => seriesOf(table, position, rows.map((row) => table.columns[position]!.numbers[row]!))),
    thinned,
  };
}

function prepareBars(table: Table, spec: ChartSpec, rowsName: string): PreparedBars {
  const xColumn = table.columns[spec.x!]!;
  const label = (row: number) => xColumn.labels[row]! || BLANK;
  const counting = spec.y.length === 0;
  let categories: string[] = [];
  let series: Series[];

  if (spec.aggregate === "none" && !counting) {
    categories = Array.from({ length: table.rowCount }, (_, row) => label(row));
    series = spec.y.map((position) => seriesOf(table, position, [...table.columns[position]!.numbers]));
  } else {
    // Group rows by label, in the order each label first appears.
    const index = new Map<string, number[]>();
    for (let row = 0; row < table.rowCount; row += 1) {
      const key = label(row);
      const rows = index.get(key);
      if (rows) rows.push(row);
      else index.set(key, [row]);
    }
    categories = [...index.keys()];
    const groups = [...index.values()];
    if (counting) {
      series = [{ column: spec.x!, name: rowsName, slot: 0, values: groups.map((rows) => rows.length) }];
    } else {
      series = spec.y.map((position) => {
        const numbers = table.columns[position]!.numbers;
        return seriesOf(
          table,
          position,
          groups.map((rows) => {
            const present = rows.map((row) => numbers[row]!).filter((value): value is number => value !== null);
            if (present.length === 0) return null;
            const sum = present.reduce((total, value) => total + value, 0);
            return spec.aggregate === "mean" ? sum / present.length : sum;
          }),
        );
      });
    }
  }

  const omitted = Math.max(0, categories.length - MAX_CATEGORIES);
  categories = categories.slice(0, MAX_CATEGORIES);
  series = series.map((s) => ({ ...s, values: s.values.slice(0, MAX_CATEGORIES) }));
  const longest = Math.max(0, ...categories.map((category) => category.length));
  const horizontal = spec.horizontal ?? (categories.length > 8 || longest > 12);
  return { type: "bar", xName: xColumn.name, categories, series, horizontal, omitted };
}

/** Bins for a histogram: round bin widths when the count is left to the data, exact ones when it is chosen. */
export function histogramBins(values: number[], requested: number | null): Bin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ from: min - 0.5, to: max + 0.5, count: values.length }];

  let edges: number[];
  if (requested === null) {
    // Sturges' rule, rounded onto a 1-2-5 bin width.
    const target = Math.min(30, Math.max(5, Math.ceil(Math.log2(values.length) + 1)));
    const width = niceStep((max - min) / target);
    const start = Math.floor(min / width + 1e-9) * width;
    const end = Math.ceil(max / width - 1e-9) * width;
    edges = [];
    const count = Math.max(1, Math.round((end - start) / width));
    for (let i = 0; i <= count; i += 1) edges.push(Number((start + i * width).toFixed(10)));
    if (edges[edges.length - 1]! <= max) edges.push(Number((edges[edges.length - 1]! + width).toFixed(10)));
  } else {
    const width = (max - min) / requested;
    edges = Array.from({ length: requested + 1 }, (_, i) => min + i * width);
    edges[requested] = max;
  }

  const bins: Bin[] = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1]!, count: 0 }));
  for (const value of values) {
    // Half-open [from, to); the very last edge belongs to the last bin.
    let at = bins.findIndex((bin) => value >= bin.from && value < bin.to);
    if (at < 0) at = bins.length - 1;
    bins[at]!.count += 1;
  }
  return bins;
}

function prepareHistogram(table: Table, spec: ChartSpec): PreparedHistogram {
  const position = spec.y[0]!;
  const values = table.columns[position]!.numbers.filter((value): value is number => value !== null);
  return { type: "histogram", name: table.columns[position]!.name, slot: slotOf(table, position) ?? 0, bins: histogramBins(values, spec.bins), total: values.length };
}

function prepareScatter(table: Table, spec: ChartSpec): PreparedScatter {
  const xColumn = table.columns[spec.x!]!;
  // Only rows with an x can be placed; a series skips the rows where its own value is missing.
  const rows = Array.from({ length: table.rowCount }, (_, row) => row).filter((row) => xColumn.numbers[row] !== null);
  return {
    type: "scatter",
    xName: xColumn.name,
    xs: rows.map((row) => xColumn.numbers[row]!),
    series: spec.y.map((position) => seriesOf(table, position, rows.map((row) => table.columns[position]!.numbers[row]!))),
  };
}

/** `rowsName` is the word for "rows" in the reader's language, used when a bar chart counts them. */
export function prepare(table: Table, spec: ChartSpec, rowsName = "Rows"): Prepared {
  switch (spec.type) {
    case "line":
      return prepareLine(table, spec);
    case "histogram":
      return prepareHistogram(table, spec);
    case "scatter":
      return prepareScatter(table, spec);
    default:
      return prepareBars(table, spec, rowsName);
  }
}
