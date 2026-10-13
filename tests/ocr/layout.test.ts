import { describe, expect, it } from "vitest";

import {
  DOUBTFUL,
  MAX_SKEW,
  VERY_DOUBTFUL,
  buildTable,
  doubtfulWords,
  estimateSkew,
  findColumnCuts,
  inkMask,
  rotatedSize,
  shiftWords,
  straightenAngle,
  tableToCsv,
  type GrayImage,
  type Word,
} from "@/lib/ocr/layout";

/** A white page with rows of "words" (dark bars) the way printed text looks to a profile: lines of ink with gaps between words. */
function page(options: { width?: number; height?: number; lines?: number; tilt?: number; columns?: [number, number][]; top?: number; lineGap?: number } = {}): GrayImage {
  const { width = 400, height = 300, lines = 8, tilt = 0, columns = [[30, 370]], top = 30, lineGap = 30 } = options;
  const data = new Uint8Array(width * height).fill(255);
  const slope = Math.tan((tilt * Math.PI) / 180);
  for (let line = 0; line < lines; line += 1) {
    for (const [from, to] of columns) {
      // Words of 22–40 px; gaps and widths differ from line to line, as in real text, so word gaps do not line up into false gutters.
      let x = from;
      while (x < to) {
        const w = 22 + ((x * 7 + line * 13) % 18);
        for (let dx = 0; dx < Math.min(w, to - x); dx += 1) {
          for (let dy = 0; dy < 9; dy += 1) {
            const y = Math.round(top + line * lineGap + dy + (x + dx) * slope);
            if (y >= 0 && y < height) data[y * width + (x + dx)] = 20;
          }
        }
        x += w + 8 + ((line * 5) % 6);
      }
    }
  }
  return { data, width, height };
}

describe("inkMask", () => {
  it("marks dark text on a light page", () => {
    const mask = inkMask(page());
    const total = mask.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThan(400 * 300 * 0.5);
  });

  it("still marks the text, not the page, when the page is dark", () => {
    const image = page();
    const inverted = { ...image, data: image.data.map((v) => 255 - v) };
    const mask = inkMask(inverted);
    expect(mask.reduce((a, b) => a + b, 0)).toBeLessThan(400 * 300 * 0.5);
    expect(mask[(30 + 4) * 400 + 40]).toBe(1);
  });

  it("copes with a blank page", () => {
    const mask = inkMask({ data: new Uint8Array(100).fill(200), width: 10, height: 10 });
    expect(mask).toHaveLength(100);
  });
});

describe("estimateSkew", () => {
  it("finds no tilt in straight text, and straightens nothing", () => {
    const skew = estimateSkew(page());
    expect(skew.angle).toBe(0);
    expect(straightenAngle(skew)).toBe(0);
  });

  it.each([-6, -3, -1.5, 1, 2.5, 5, 8])("finds a tilt of %s degrees", (tilt) => {
    const skew = estimateSkew(page({ tilt }));
    expect(Math.abs(skew.angle - tilt)).toBeLessThanOrEqual(0.6);
    expect(skew.gain).toBeGreaterThan(0.05);
    expect(straightenAngle(skew)).toBe(skew.angle);
  });

  it("does not trust a tiny tilt or a page with no lines", () => {
    expect(straightenAngle({ angle: 0.2, gain: 1 })).toBe(0);
    expect(straightenAngle({ angle: 3, gain: 0.01 })).toBe(0);
    expect(estimateSkew({ data: new Uint8Array(200 * 200).fill(255), width: 200, height: 200 })).toEqual({ angle: 0, gain: 0 });
    const noise = new Uint8Array(200 * 200).map((_, i) => ((i * 7919) % 13 === 0 ? 0 : 255));
    expect(Math.abs(straightenAngle(estimateSkew({ data: noise, width: 200, height: 200 })))).toBeLessThanOrEqual(MAX_SKEW);
  });

  it("works on a page with a lot of ink by sampling it", () => {
    const skew = estimateSkew(page({ tilt: 3, lines: 9, lineGap: 28 }), 2000);
    expect(Math.abs(skew.angle - 3)).toBeLessThanOrEqual(0.8);
  });

  it("sizes a rotated page so no corner is lost", () => {
    expect(rotatedSize(400, 300, 0)).toEqual({ width: 400, height: 300 });
    const turned = rotatedSize(400, 300, 5);
    expect(turned.width).toBeGreaterThan(400);
    expect(turned.height).toBeGreaterThan(300);
    expect(rotatedSize(400, 300, -5)).toEqual(turned);
  });
});

describe("findColumnCuts", () => {
  it("finds nothing in a single column", () => {
    expect(findColumnCuts(page())).toEqual([]);
  });

  it("cuts a two-column page in the gutter between them", () => {
    const cuts = findColumnCuts(page({ columns: [[20, 180], [220, 380]] }));
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toBeGreaterThan(180);
    expect(cuts[0]).toBeLessThan(220);
  });

  it("cuts a three-column page twice, in order", () => {
    const cuts = findColumnCuts(page({ width: 600, columns: [[20, 180], [215, 385], [420, 580]] }));
    expect(cuts).toHaveLength(2);
    expect(cuts[0]!).toBeLessThan(cuts[1]!);
    expect(cuts[0]!).toBeGreaterThan(180);
    expect(cuts[1]!).toBeGreaterThan(385);
  });

  it("does not take a narrow gap for a gutter", () => {
    expect(findColumnCuts(page({ columns: [[20, 198], [202, 380]] }))).toEqual([]);
  });

  it("ignores a margin that is empty on one side only", () => {
    expect(findColumnCuts(page({ columns: [[150, 380]] }))).toEqual([]);
  });

  it("copes with a blank or tiny image", () => {
    expect(findColumnCuts({ data: new Uint8Array(400 * 300).fill(255), width: 400, height: 300 })).toEqual([]);
    expect(findColumnCuts({ data: new Uint8Array(100), width: 10, height: 10 })).toEqual([]);
  });
});

const word = (text: string, x0: number, y0: number, x1: number, y1: number, line: number, confidence = 90): Word => ({ text, confidence, bbox: { x0, y0, x1, y1 }, line });

describe("doubtful words", () => {
  const words = [word("sure", 0, 0, 40, 10, 0, 96), word("hmm", 50, 0, 80, 10, 0, 61), word("garbled", 90, 0, 150, 10, 0, 22), word(" ", 160, 0, 165, 10, 0, 5)];

  it("lists the words below the threshold, never blanks", () => {
    expect(doubtfulWords(words).map((w) => w.text)).toEqual(["hmm", "garbled"]);
    expect(doubtfulWords(words, VERY_DOUBTFUL).map((w) => w.text)).toEqual(["garbled"]);
    expect(DOUBTFUL).toBeGreaterThan(VERY_DOUBTFUL);
    expect(doubtfulWords([])).toEqual([]);
  });

  it("moves boxes without touching anything else", () => {
    const moved = shiftWords(words, 100, 20);
    expect(moved[0]).toEqual({ ...words[0], bbox: { x0: 100, y0: 20, x1: 140, y1: 30 } });
    expect(words[0]!.bbox.x0).toBe(0);
  });
});

describe("buildTable", () => {
  /** A 3-column table: "Item", "Qty", "Price", words 10 high, 40 px between columns. */
  const grid = (rows: string[][]): Word[] =>
    rows.flatMap((cells, r) =>
      cells.flatMap((cell, c) =>
        cell === ""
          ? []
          : cell.split(" ").map((piece, p) => {
              const x0 = 20 + c * 150 + p * 45; // a word space is about half the text height
              return word(piece, x0, 20 + r * 25, x0 + 40, 30 + r * 25, r);
            }),
      ),
    );

  it("rebuilds rows and columns, keeping the words of a cell together", () => {
    const table = buildTable(grid([["Item", "Qty", "Price"], ["Blue pen", "2", "3.50"], ["Notebook", "10", "42.00"]]));
    expect(table).toEqual([["Item", "Qty", "Price"], ["Blue pen", "2", "3.50"], ["Notebook", "10", "42.00"]]);
  });

  it("keeps an empty cell in its column", () => {
    const table = buildTable(grid([["Item", "Qty", "Price"], ["Pen", "", "3.50"], ["Pad", "4", ""]]));
    expect(table).toEqual([["Item", "Qty", "Price"], ["Pen", "", "3.50"], ["Pad", "4", ""]]);
  });

  it("reads rows top to bottom whatever order the words came in", () => {
    const words = grid([["a", "b"], ["c", "d"], ["e", "f"]]).reverse();
    expect(buildTable(words).map((row) => row.join(","))).toEqual(["a,b", "c,d", "e,f"]);
  });

  it("makes a single column of ordinary text lines", () => {
    const text = [word("Hello", 10, 10, 50, 20, 0), word("world", 56, 10, 96, 20, 0), word("Second", 10, 40, 60, 50, 1), word("line", 66, 40, 96, 50, 1)];
    expect(buildTable(text)).toEqual([["Hello world"], ["Second line"]]);
  });

  it("aligns right-aligned numbers of different widths into one column", () => {
    const rows = [
      [word("Total", 10, 10, 60, 20, 0), word("5", 300, 10, 310, 20, 0)],
      [word("Sum", 10, 40, 50, 50, 1), word("1250.00", 270, 40, 310, 50, 1)],
    ];
    expect(buildTable(rows.flat())).toEqual([["Total", "5"], ["Sum", "1250.00"]]);
  });

  it("returns nothing for no words, blanks or an empty page", () => {
    expect(buildTable([])).toEqual([]);
    expect(buildTable([word(" ", 0, 0, 5, 5, 0)])).toEqual([]);
  });

  it("writes CSV with quoting where it is needed", () => {
    expect(tableToCsv([["Item", "Note"], ["Pen, blue", 'say "hi"'], ["Multi\nline", ""]])).toBe('Item,Note\n"Pen, blue","say ""hi"""\n"Multi\nline",\n');
    expect(tableToCsv([])).toBe("\n");
  });
});
