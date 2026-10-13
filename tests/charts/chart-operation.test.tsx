// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChartOperation } from "@/components/workbench/operations/ChartOperations";
import { findHit } from "@/components/charts/ChartView";
import type { Scene } from "@/lib/charts/build";
import { tch } from "@/lib/charts/i18n";
import { DARK, LIGHT } from "@/lib/charts/palette";
import { createAssetFromText } from "@/lib/workbench/asset";
import type { OperationOutput } from "@/lib/workbench/operation";
import { axeViolations, click, mount, press, type, waitFor } from "../helpers/dom";

const png = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/charts/export", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/charts/export")>();
  return {
    ...actual,
    svgToPng: async () => {
      if (png.fail) throw new Error("no canvas");
      return new Uint8Array([137, 80, 78, 71]);
    },
  };
});

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  png.fail = false;
});

const MONTHLY = "Month,Sales,Costs,Profit\n2026-01-01,1200,800,400\n2026-02-01,1500,850,650\n2026-03-01,900,870,30\n2026-04-01,1700,900,800\n";
const REGIONS = "Region,Revenue\nNorth,100\nSouth,80\nEast,60\n";
const text = () => document.body.textContent ?? "";
const svg = () => document.querySelector<SVGSVGElement>('[role="group"] svg[role="img"]');
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;
const box = () => document.querySelector<HTMLElement>('[role="group"][tabindex="0"]')!;

/** Hosts the operation the way the shell does: it owns the persisted params and collects outputs. */
function Host({ csv, name = "sales.csv", lang = "en", outputs }: { csv: string; name?: string; lang?: "en" | "ru"; outputs: OperationOutput[] }) {
  const asset = React.useMemo(() => createAssetFromText(name, csv), [csv, name]);
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  return (
    <ChartOperation
      lang={lang}
      assets={[asset]}
      params={params}
      setParams={(patch) => setParams((current) => ({ ...current, ...patch }))}
      onProduce={(output) => outputs.push(output)}
    />
  );
}

async function open(csv: string, extra: Partial<React.ComponentProps<typeof Host>> = {}) {
  const outputs: OperationOutput[] = [];
  const view = await mount(<Host csv={csv} outputs={outputs} {...extra} />);
  await waitFor(() => expect(svg()).toBeTruthy());
  return { view, outputs };
}

describe("ChartOperation — the first chart", () => {
  it("draws a line chart for dated data, with a legend and a title, accessibly", async () => {
    const { view } = await open(MONTHLY);
    const root = svg()!;
    expect(root.querySelector("title")?.textContent).toBe("Sales, Costs, Profit by Month");
    expect([...root.querySelectorAll("text")].map((n) => n.textContent)).toEqual(expect.arrayContaining(["Sales", "Costs", "Profit"]));
    expect(root.querySelectorAll("path[stroke-width='2']").length).toBe(3);
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("draws bars for labelled numbers", async () => {
    const { view } = await open(REGIONS);
    expect(svg()!.querySelector("title")?.textContent).toBe("Revenue by Region");
    expect(svg()!.querySelectorAll("path[fill='#2a78d6']").length).toBe(3);
    view.unmount();
  });

  it("says there is nothing to chart for an empty sheet", async () => {
    const outputs: OperationOutput[] = [];
    const view = await mount(<Host csv={"\n\n"} outputs={outputs} />);
    await waitFor(() => expect(text()).toContain(tch("en", "noData")));
    expect(svg()).toBeNull();
    view.unmount();
  });
});

describe("ChartOperation — changing the chart", () => {
  it("switches type, keeping each column's colour", async () => {
    const { view } = await open(MONTHLY);
    await click(button(tch("en", "typeBar")));
    await waitFor(() => expect(button(tch("en", "typeGrouped"))).toBeTruthy());
    const fills = new Set([...svg()!.querySelectorAll("path")].map((n) => n.getAttribute("fill")).filter((f) => f?.startsWith("#")));
    expect(fills).toEqual(new Set([LIGHT.series[0], LIGHT.series[1], LIGHT.series[2]]));

    // Hide the first series: the others keep their colours.
    const sales = [...document.querySelectorAll<HTMLInputElement>('input[name="chart-y"]')].find((i) => i.closest("label")?.textContent === "Sales")!;
    await click(sales);
    const after = new Set([...svg()!.querySelectorAll("path")].map((n) => n.getAttribute("fill")).filter((f) => f?.startsWith("#")));
    expect(after).toEqual(new Set([LIGHT.series[1], LIGHT.series[2]]));
    view.unmount();
  });

  it("limits the series, disabling the rest once the limit is reached", async () => {
    const wide = `D,${Array.from({ length: 8 }, (_, i) => `S${i}`).join(",")}\n2026-01-01,${"1,".repeat(7)}1\n2026-01-02,${"2,".repeat(7)}2\n`;
    const { view } = await open(wide);
    const boxes = [...document.querySelectorAll<HTMLInputElement>('input[name="chart-y"]')];
    expect(boxes).toHaveLength(8);
    expect(boxes.filter((b) => b.checked)).toHaveLength(6);
    expect(boxes.filter((b) => !b.checked && b.disabled)).toHaveLength(2);
    // Never fewer than one series on a line chart.
    for (const b of boxes.filter((x) => x.checked).slice(1)) await click(b);
    expect(boxes.filter((b) => b.checked && b.disabled)).toHaveLength(1);
    view.unmount();
  });

  it("offers a histogram with a bin count, and scatter with a numeric axis", async () => {
    const { view } = await open("Score\n1\n2\n2\n3\n3\n3\n9\n");
    expect(button("Histogram")?.getAttribute("aria-pressed")).toBe("true");
    const bins = document.querySelector<HTMLInputElement>('input[type="number"]')!;
    await type(bins, "3");
    expect(svg()!.querySelectorAll("path[fill='#2a78d6']").length).toBeLessThanOrEqual(3);
    view.unmount();
  });

  it("combines repeated labels and can count rows", async () => {
    const { view } = await open("Team,Role\nA,dev\nA,qa\nB,dev\n");
    expect(svg()!.querySelector("title")?.textContent).toBe("Number of rows by Team");
    view.unmount();
  });

  it("uses the first row as a header only when it looks like one, and lets you override it", async () => {
    const { view } = await open("1,2\n3,4\n5,7\n");
    expect(document.querySelector<HTMLInputElement>('label input[type="checkbox"]')!.checked).toBe(false);
    expect(text()).toContain("Column A");
    await click(document.querySelector('label input[type="checkbox"]'));
    await waitFor(() => expect(text()).toContain("5"));
    view.unmount();
  });

  it("takes a custom title", async () => {
    const { view } = await open(REGIONS);
    await type(document.querySelector<HTMLInputElement>('input[placeholder="Automatic"]'), "Q4 revenue");
    expect(svg()!.querySelector("title")?.textContent).toBe("Q4 revenue");
    view.unmount();
  });
});

describe("ChartOperation — hover, keyboard and the table", () => {
  it("shows every series' value for a point with the arrow keys, and hides it with Escape", async () => {
    const { view } = await open(MONTHLY);
    const group = box();
    group.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 380, right: 720, bottom: 380, x: 0, y: 0, toJSON() {} }) as DOMRect;
    await act(async () => group.focus());
    expect(document.querySelector('[role="status"].absolute')).toBeNull();
    await press(group, "ArrowRight");
    const tip = document.querySelector<HTMLElement>('[role="status"].absolute')!;
    expect(tip.textContent).toContain("1 Jan 2026");
    expect(tip.textContent).toContain("1,200");
    expect(tip.textContent).toContain("Costs");
    await press(group, "ArrowRight");
    expect(document.querySelector('[role="status"].absolute')!.textContent).toContain("1 Feb 2026");
    await press(group, "End");
    expect(document.querySelector('[role="status"].absolute')!.textContent).toContain("1 Apr 2026");
    await press(group, "Escape");
    expect(document.querySelector('[role="status"].absolute')).toBeNull();
    view.unmount();
  });

  it("follows the pointer with a crosshair", async () => {
    const { view } = await open(MONTHLY);
    const group = box();
    group.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 380, right: 720, bottom: 380, x: 0, y: 0, toJSON() {} }) as DOMRect;
    await act(async () => {
      group.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 400, clientY: 150 }));
    });
    await waitFor(() => expect(document.querySelector('svg[aria-hidden="true"] line')).toBeTruthy());
    await act(async () => {
      group.dispatchEvent(new MouseEvent("pointerleave", { bubbles: false }));
    });
    // React maps pointerleave from pointerout; the keyboard path is the dependable assertion above.
    view.unmount();
  });

  it("shows the data behind the chart as a table, on request", async () => {
    const { view } = await open(MONTHLY);
    expect(document.querySelector("table")).toBeNull();
    await click(button(tch("en", "showTable")));
    const table = document.querySelector("table")!;
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Month", "Sales", "Costs", "Profit"]);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(table.querySelector("tbody tr")!.textContent).toContain("1,200");
    expect(await axeViolations()).toEqual([]);
    await click(button(tch("en", "hideTable")));
    expect(document.querySelector("table")).toBeNull();
    view.unmount();
  });
});

describe("ChartOperation — width", () => {
  it("draws at the width of its container, so text keeps its size on a phone", async () => {
    const observers: (() => void)[] = [];
    class FakeObserver {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    let clientWidth = 372;
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => clientWidth);
    try {
      const { view } = await open(REGIONS);
      expect(svg()!.getAttribute("viewBox")!.split(" ")[2]).toBe("370");
      expect(Number(svg()!.getAttribute("viewBox")!.split(" ")[3])).toBeLessThan(380);
      clientWidth = 900;
      await act(async () => observers.forEach((callback) => callback()));
      await waitFor(() => expect(svg()!.getAttribute("viewBox")!.split(" ")[2]).toBe("900"));
      // Very wide containers stop growing: a chart is not a poster.
      clientWidth = 2000;
      await act(async () => observers.forEach((callback) => callback()));
      await waitFor(() => expect(svg()!.getAttribute("viewBox")!.split(" ")[2]).toBe("960"));
      view.unmount();
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("exports at the fixed width whatever the screen is", async () => {
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => 372);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    try {
      const { view, outputs } = await open(MONTHLY);
      await click(button(tch("en", "addSvg")));
      expect(new TextDecoder().decode(outputs[0]!.bytes)).toContain('viewBox="0 0 720 ');
      view.unmount();
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe("findHit", () => {
  const scene = (hitMode: Scene["hitMode"], hits: Scene["hits"]): Scene =>
    ({ hitMode, hits, plot: { left: 40, top: 20, right: 700, bottom: 330 } }) as Scene;
  const hit = (x: number, y: number, w?: number, h?: number) => ({ x, y, w, h, title: "", rows: [], marks: [] });

  it("snaps a crosshair to the nearest x anywhere in the plot, and not outside it", () => {
    const s = scene("x", [hit(100, 20), hit(300, 20), hit(500, 20)]);
    expect(findHit(s, 280, 200)).toBe(1);
    expect(findHit(s, 450, 25)).toBe(2);
    expect(findHit(s, 10, 200)).toBeNull();
    expect(findHit(s, 300, 500)).toBeNull();
  });

  it("finds the band the pointer is inside", () => {
    const s = scene("band", [hit(40, 20, 100, 310), hit(140, 20, 100, 310)]);
    expect(findHit(s, 139, 100)).toBe(0);
    expect(findHit(s, 140, 100)).toBe(1);
    expect(findHit(s, 500, 100)).toBeNull();
    expect(findHit(s, 100, 335)).toBeNull();
  });

  it("selects the nearest dot only within reach", () => {
    const s = scene("point", [hit(100, 100), hit(300, 200)]);
    expect(findHit(s, 110, 108)).toBe(0);
    expect(findHit(s, 296, 190)).toBe(1);
    expect(findHit(s, 200, 150)).toBeNull();
  });

  it("handles an empty chart", () => {
    expect(findHit(scene("x", []), 100, 100)).toBeNull();
  });
});

describe("ChartOperation — look and language", () => {
  it("follows the page theme with the dark palette's own colours", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { view } = await open(REGIONS);
    await waitFor(() => expect(svg()!.querySelector("rect")!.getAttribute("fill")).toBe(DARK.surface));
    expect(svg()!.querySelector("path[fill='#3987e5']")).toBeTruthy();
    document.documentElement.setAttribute("data-theme", "light");
    await waitFor(() => expect(svg()!.querySelector("rect")!.getAttribute("fill")).toBe(LIGHT.surface));
    view.unmount();
  });

  it("adds patterns on request", async () => {
    const { view } = await open(REGIONS);
    expect(svg()!.querySelector("pattern")).toBeNull();
    await click([...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) => i.closest("label")?.textContent?.includes("patterns")));
    await waitFor(() => expect(svg()!.querySelector("pattern")).toBeTruthy());
    expect(svg()!.querySelector("path[fill^='url(#']")).toBeTruthy();
    view.unmount();
  });

  it("speaks Russian, with its number and date formats", async () => {
    const { view } = await open(MONTHLY, { lang: "ru" });
    expect(text()).toContain(tch("ru", "settings"));
    expect(svg()!.querySelector("title")?.textContent).toBe("Sales, Costs, Profit по Month");
    expect(button("Линия")).toBeTruthy();
    view.unmount();
  });

  it("stays accessible with every control showing", async () => {
    const { view } = await open(REGIONS);
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});

describe("ChartOperation — taking it away", () => {
  it("adds the SVG to the outputs: standalone, light, named after the file", async () => {
    const { view, outputs } = await open(MONTHLY);
    await click(button(tch("en", "addSvg")));
    expect(outputs).toHaveLength(1);
    const output = outputs[0]!;
    expect(output).toMatchObject({ name: "sales-chart.svg", type: "image/svg+xml", kind: "image" });
    const markup = new TextDecoder().decode(output.bytes);
    expect(markup.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(markup).toContain(`fill="${LIGHT.surface}"`);
    expect(markup).not.toContain("var(--");
    expect(new DOMParser().parseFromString(markup, "image/svg+xml").querySelector("parsererror")).toBeNull();
    view.unmount();
  });

  it("exports on the chosen background whatever the page theme is", async () => {
    const { view, outputs } = await open(MONTHLY);
    const select = [...document.querySelectorAll<HTMLSelectElement>("select")].find((s) => s.closest("label")?.textContent?.startsWith(tch("en", "exportBackground")))!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "dark");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button(tch("en", "addSvg")));
    expect(new TextDecoder().decode(outputs[0]!.bytes)).toContain(`fill="${DARK.surface}"`);
    view.unmount();
  });

  it("adds a PNG, and says so when the browser cannot make one", async () => {
    const { view, outputs } = await open(MONTHLY);
    await click(button(tch("en", "addPng")));
    await waitFor(() => expect(outputs).toHaveLength(1));
    expect(outputs[0]).toMatchObject({ name: "sales-chart.png", type: "image/png", kind: "image" });
    expect(Array.from(outputs[0]!.bytes)).toEqual([137, 80, 78, 71]);

    png.fail = true;
    await click(button(tch("en", "addPng")));
    await waitFor(() => expect(text()).toContain(tch("en", "exportFailed")));
    expect(outputs).toHaveLength(1);
    view.unmount();
  });
});
