// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ChartOperation } from "@/components/workbench/operations/ChartOperations";
import { tch } from "@/lib/charts/i18n";
import { CHART_MEMORY_KEY, readChartMemory } from "@/lib/charts/memory";
import { createAssetFromText } from "@/lib/workbench/asset";
import type { OperationOutput } from "@/lib/workbench/operation";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const LONG = "Month,Region,Sales\n2026-01-01,North,10\n2026-01-01,South,20\n2026-02-01,North,12\n2026-02-01,South,18\n2026-03-01,North,15\n2026-03-01,South,22\n";
const QUARTERS = "Quarter,Product,Revenue\nQ1,Alpha,100\nQ1,Beta,50\nQ2,Alpha,120\nQ2,Beta,60\n";
const text = () => document.body.textContent ?? "";
const svg = () => document.querySelector<SVGSVGElement>('[role="group"] svg[role="img"]');
const button = (label: string) => [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;
const checkbox = (label: string) =>
  [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(label))?.querySelector<HTMLInputElement>("input") ?? null;
const select = (label: string) =>
  [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(label))?.querySelector<HTMLSelectElement>("select") ?? null;

async function choose(element: HTMLSelectElement | null, value: string) {
  if (!element) throw new Error("select not found");
  const { act } = await import("react");
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function Host({ csv, name = "data.csv", outputs = [] }: { csv: string; name?: string; outputs?: OperationOutput[] }) {
  const asset = React.useMemo(() => createAssetFromText(name, csv), [csv, name]);
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  return <ChartOperation lang="en" assets={[asset]} params={params} setParams={(p) => setParams((c) => ({ ...c, ...p }))} onProduce={(o) => outputs.push(o)} />;
}

async function open(csv: string, name?: string) {
  const view = await mount(<Host csv={csv} name={name} />);
  await waitFor(() => expect(svg()).toBeTruthy());
  return view;
}

describe("ChartOperation — long data", () => {
  it("draws one line per region for Month, Region, Sales, named in the title and legend", async () => {
    const view = await open(LONG);
    const root = svg()!;
    expect(root.querySelector("title")?.textContent).toBe("Sales by Month, for each Region");
    expect([...root.querySelectorAll("text")].map((n) => n.textContent)).toEqual(expect.arrayContaining(["North", "South"]));
    expect(root.querySelectorAll("path[stroke-width='2']").length).toBe(2);
    expect(select(tch("en", "splitBy"))!.value).toBe("1");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("can be turned back to the number columns, and split again", async () => {
    const view = await open(LONG);
    await choose(select(tch("en", "splitBy")), "");
    await waitFor(() => expect(svg()!.querySelector("title")?.textContent).toBe("Sales by Month"));
    await choose(select(tch("en", "splitBy")), "1");
    await waitFor(() => expect(svg()!.querySelector("title")?.textContent).toBe("Sales by Month, for each Region"));
    view.unmount();
  });

  it("offers a single measure while split, as radio buttons", async () => {
    const view = await open(LONG);
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[name="chart-y"]')];
    expect(inputs.every((input) => input.type === "radio")).toBe(true);
    view.unmount();
  });

  it("stacks grouped bars on request, with a Total in the table twin's chart", async () => {
    const view = await open(QUARTERS);
    expect(svg()!.querySelector("title")?.textContent).toBe("Revenue by Quarter, for each Product");
    expect(button(tch("en", "typeGrouped"))).toBeTruthy();
    expect(checkbox(tch("en", "stacked"))!.checked).toBe(false);
    const before = svg()!.outerHTML;
    await click(checkbox(tch("en", "stacked")));
    await waitFor(() => expect(svg()!.outerHTML).not.toBe(before));
    expect(svg()!.outerHTML).toContain(">150<");
    await click(checkbox(tch("en", "stacked")));
    await waitFor(() => expect(svg()!.outerHTML).toBe(before));
    view.unmount();
  });

  it("does not offer stacking for a single series or a line", async () => {
    const view = await open("Region,Revenue\nNorth,100\nSouth,80\n");
    expect(checkbox(tch("en", "stacked"))).toBeNull();
    view.unmount();
    const line = await open(LONG);
    expect(checkbox(tch("en", "stacked"))).toBeNull();
    line.unmount();
  });

  it("says when more groups than fit were left out", async () => {
    const rows = ["Month,Group,Value", ...Array.from({ length: 8 }, (_, i) => `2026-01-0${i + 1},G${i},${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `2026-02-0${i + 1},G${i},${i + 2}`)];
    const view = await open(`${rows.join("\n")}\n`);
    // Eight groups are too many to suggest on its own, but they can be asked for.
    expect(select(tch("en", "splitBy"))!.value).toBe("");
    await choose(select(tch("en", "splitBy")), "1");
    await waitFor(() => expect(text()).toContain(tch("en", "omittedSeries", { n: 2, max: 6 })));
    view.unmount();
  });
});

describe("ChartOperation — remembering", () => {
  it("leaves nothing behind when the file is only looked at", async () => {
    const view = await open(QUARTERS);
    expect(localStorage.getItem(CHART_MEMORY_KEY)).toBeNull();
    view.unmount();
  });

  it("brings back the settings when the same file is opened again", async () => {
    const first = await open(QUARTERS, "quarters.csv");
    await click(checkbox(tch("en", "stacked")));
    const titleInput = [...document.querySelectorAll<HTMLInputElement>("input")].find((i) => i.placeholder === tch("en", "titlePlaceholder"))!;
    const { type } = await import("../helpers/dom");
    await type(titleInput, "Mine");
    await waitFor(() => expect(svg()!.querySelector("title")?.textContent).toBe("Mine"));
    const saved = readChartMemory()[Object.keys(readChartMemory())[0]!]!;
    // Only what the user changed is kept: the suggestion is worked out afresh from the data.
    expect(saved.sheets.Sheet1!.spec).toEqual({ stacked: true });
    expect(saved.sheets.Sheet1!.title).toBe("Mine");
    first.unmount();
    document.body.innerHTML = "";

    const second = await open(QUARTERS, "quarters.csv");
    expect(svg()!.querySelector("title")?.textContent).toBe("Mine");
    expect(checkbox(tch("en", "stacked"))!.checked).toBe(true);
    second.unmount();
  });

  it("does not mix up two different files with the same name", async () => {
    const first = await open(QUARTERS, "same.csv");
    await click(checkbox(tch("en", "stacked")));
    first.unmount();
    document.body.innerHTML = "";
    const other = await open(`${QUARTERS}Q3,Alpha,1\nQ3,Beta,2\n`, "same.csv");
    expect(checkbox(tch("en", "stacked"))!.checked).toBe(false);
    other.unmount();
  });

  it("goes back to the suggestion with one button, and forgets the change", async () => {
    const view = await open(QUARTERS);
    expect(button(tch("en", "reset"))!.disabled).toBe(true);
    await click(checkbox(tch("en", "stacked")));
    expect(button(tch("en", "reset"))!.disabled).toBe(false);
    await click(button(tch("en", "reset")));
    await waitFor(() => expect(checkbox(tch("en", "stacked"))!.checked).toBe(false));
    const saved = readChartMemory();
    expect(Object.values(saved)[0]!.sheets.Sheet1!.spec).toEqual({});
    expect(text()).toContain(tch("en", "remembered"));
    view.unmount();
  });

  it("copes with a damaged memory", async () => {
    localStorage.setItem(CHART_MEMORY_KEY, "{broken");
    const view = await open(QUARTERS);
    expect(svg()).toBeTruthy();
    view.unmount();
  });
});
