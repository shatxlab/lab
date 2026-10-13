// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OcrOperation } from "@/components/workbench/operations/OcrOperations";
import { toc } from "@/lib/ocr/i18n";
import type { OcrResult, PageResult } from "@/lib/ocr/run";
import { createAssetFromBytes } from "@/lib/workbench/asset";
import type { OperationOutput } from "@/lib/workbench/operation";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

const run = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], result: null as unknown }));
vi.mock("@/lib/ocr/run", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ocr/run")>();
  return {
    ...actual,
    runOcr: async (options: Record<string, unknown>) => {
      run.calls.push(options);
      return run.result;
    },
  };
});

const MANIFEST = {
  version: "7.0.0",
  worker: { path: "worker.min.js", size: 100 },
  cores: { simd: { path: "core/simd.js", size: 400 }, baseline: { path: "core/base.js", size: 400 } },
  languages: [{ code: "eng", path: "lang/eng.traineddata.gz", size: 300 }],
};

let store: Map<string, Response>;
beforeEach(() => {
  run.calls = [];
  store = new Map();
  vi.stubGlobal("caches", { open: async () => ({ match: async (url: string) => store.get(url)?.clone(), put: async (url: string, response: Response) => void store.set(url, response), delete: async (url: string) => store.delete(url) }) });
  vi.stubGlobal("Worker", class {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith("manifest.json") ? new Response(JSON.stringify(MANIFEST)) : new Response(new Uint8Array(100), { status: 200 }))));
  URL.createObjectURL = vi.fn(() => "blob:page") as never;
  URL.revokeObjectURL = vi.fn() as never;
});
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
});

const text = () => document.body.textContent ?? "";
const button = (label: string | RegExp) => [...document.querySelectorAll("button")].find((n) => (typeof label === "string" ? n.textContent?.trim() === label : label.test(n.textContent ?? ""))) as HTMLButtonElement | undefined;
const checkbox = (label: string) => [...document.querySelectorAll("label")].find((l) => l.textContent?.trim().startsWith(label))?.querySelector<HTMLInputElement>("input")!;
const layoutSelect = () => [...document.querySelectorAll("label")].find((l) => l.textContent?.startsWith(toc("en", "layout")))!.querySelector("select")!;

const word = (text: string, confidence: number, x: number) => ({ text, confidence, bbox: { x0: x, y0: 10, x1: x + 40, y1: 24 }, line: 0 });
const page = (number: number, words = [word("clear", 96, 10), word("hmm", 60, 60), word("garbled", 20, 110)], over: Partial<PageResult> = {}): PageResult => ({
  number,
  text: "clear hmm garbled\n",
  confidence: 70,
  words,
  width: 400,
  height: 200,
  straightened: 0,
  columns: 1,
  image: new Blob(["jpg"], { type: "image/jpeg" }),
  ...over,
});
const result = (over: Partial<OcrResult> = {}): OcrResult => ({ text: "clear hmm garbled\n", confidence: 70, pages: 1, details: [page(1)], table: null, ...over });

function Host({ outputs }: { outputs: OperationOutput[] }) {
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  const asset = React.useMemo(() => createAssetFromBytes("scan.png", new Uint8Array([137, 80, 78, 71]), "image"), []);
  return <OcrOperation lang="en" assets={[asset]} params={params} setParams={(patch) => setParams((p) => ({ ...p, ...patch }))} onProduce={(o) => outputs.push(o)} />;
}

async function ready() {
  const outputs: OperationOutput[] = [];
  const view = await mount(<Host outputs={outputs} />);
  await waitFor(() => expect(button(/^Download \(/)).toBeTruthy());
  await click(button(/^Download \(/)!);
  await waitFor(() => expect(button("Recognize text")!.disabled).toBe(false));
  return { view, outputs };
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("OCR options", () => {
  it("passes the layout and the straightening choice on, straightening being on to begin with", async () => {
    run.result = result();
    const { view } = await ready();
    expect(checkbox(toc("en", "straighten")).checked).toBe(true);
    expect(layoutSelect().value).toBe("auto");
    await click(button("Recognize text")!);
    await waitFor(() => expect(run.calls).toHaveLength(1));
    expect(run.calls[0]).toMatchObject({ layout: "auto", straighten: true });
    await choose(layoutSelect(), "columns");
    await click(checkbox(toc("en", "straighten")));
    await click(button("Recognize text")!);
    await waitFor(() => expect(run.calls).toHaveLength(2));
    expect(run.calls[1]).toMatchObject({ layout: "columns", straighten: false });
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("offers the four layouts", async () => {
    run.result = result();
    const { view } = await ready();
    expect([...layoutSelect().options].map((o) => o.value)).toEqual(["auto", "columns", "block", "table"]);
    view.unmount();
  });
});

describe("OCR table layout", () => {
  it("shows the table that was read, and adds a spreadsheet to the outputs", async () => {
    run.result = result({ table: [["Item", "Qty"], ["Pen, blue", "2"]], text: "Item\tQty\nPen, blue\t2\n", details: [page(1)] });
    const { view, outputs } = await ready();
    await choose(layoutSelect(), "table");
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain(toc("en", "tableFound", { rows: 2, cols: 2 })));
    expect([...document.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent))).toEqual([["Item", "Qty"], ["Pen, blue", "2"]]);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ name: "scan.csv", type: "text/csv;charset=utf-8", kind: "sheet" });
    expect(new TextDecoder().decode(outputs[0]!.bytes)).toBe('Item,Qty\n"Pen, blue",2\n');
    expect(text()).toContain(toc("en", "addedCsv", { name: "scan.csv" }));
    view.unmount();
  });

  it("says so when no table was found, and adds nothing", async () => {
    run.result = result({ table: [], text: "\n", details: [] });
    const { view, outputs } = await ready();
    await choose(layoutSelect(), "table");
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain(toc("en", "tableNone")));
    expect(outputs).toHaveLength(0);
    view.unmount();
  });
});

describe("OCR doubtful words", () => {
  it("counts them, lists them and boxes them on the page as it was read", async () => {
    run.result = result();
    const { view } = await ready();
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain(toc("en", "doubtfulCount", { n: 2 })));
    expect(text()).toContain("hmm, garbled");
    const rects = document.querySelectorAll('svg[viewBox="0 0 400 200"] rect');
    expect(rects).toHaveLength(2);
    expect(document.querySelector<HTMLImageElement>("img")!.alt).toBe(toc("en", "pageAlt", { n: 1 }));
    // Switch the boxes off.
    await click(checkbox(toc("en", "showDoubtful")));
    expect(document.querySelectorAll('svg[viewBox="0 0 400 200"] rect')).toHaveLength(0);
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("is glad when every word is sure", async () => {
    run.result = result({ details: [page(1, [word("sure", 99, 10)])] });
    const { view } = await ready();
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain(toc("en", "doubtfulNone")));
    view.unmount();
  });

  it("lets you step through the pages of a PDF", async () => {
    run.result = result({ pages: 2, details: [page(2, [word("one", 40, 10)]), page(5, [word("a", 30, 10), word("b", 30, 60), word("c", 30, 110)])] });
    const { view } = await ready();
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain(toc("en", "doubtfulCount", { n: 4 })));
    expect(document.querySelectorAll('svg[viewBox="0 0 400 200"] rect')).toHaveLength(1);
    const select = [...document.querySelectorAll("label")].find((l) => l.textContent?.startsWith(toc("en", "pageLabel")))!.querySelector("select")!;
    expect([...select.options].map((o) => o.textContent)).toEqual(["2", "5"]);
    await choose(select, "1");
    expect(document.querySelectorAll('svg[viewBox="0 0 400 200"] rect')).toHaveLength(3);
    view.unmount();
  });

  it("notes the pages that were straightened or read in columns", async () => {
    run.result = result({ details: [page(1, [word("x", 99, 1)], { straightened: 3.5, columns: 2 })] });
    const { view } = await ready();
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain(toc("en", "notes", { straight: 1, columns: 1 })));
    view.unmount();
  });

  it("shows no picture when the page could not be encoded, but still lists the words", async () => {
    run.result = result({ details: [page(1, undefined, { image: null })] });
    const { view } = await ready();
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain("hmm, garbled"));
    expect(document.querySelector("img")).toBeNull();
    view.unmount();
  });
});
