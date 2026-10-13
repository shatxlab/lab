// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OcrOperation } from "@/components/workbench/operations/OcrOperations";
import { createAssetFromBytes, type Asset } from "@/lib/workbench/asset";
import type { OperationOutput } from "@/lib/workbench/operation";
import { hasOperation } from "@/lib/workbench/operations";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

const run = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], result: { text: "Hello world\n", confidence: 91.4, pages: 1, details: [] as unknown[], table: null as string[][] | null }, fail: null as Error | null, hang: false }));
vi.mock("@/lib/ocr/run", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ocr/run")>();
  return {
    ...actual,
    runOcr: async (options: { onProgress: (p: unknown) => void; signal?: AbortSignal } & Record<string, unknown>) => {
      run.calls.push(options);
      options.onProgress({ fraction: 0.3, stage: "recognizing", page: 1, pages: 1 });
      if (run.hang) await new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
      if (run.fail) throw run.fail;
      return run.result;
    },
  };
});

const MANIFEST = {
  version: "7.0.0",
  worker: { path: "worker.min.js", size: 100_000 },
  cores: { simd: { path: "core/simd.js", size: 4_000_000 }, baseline: { path: "core/base.js", size: 3_900_000 } },
  languages: [
    { code: "eng", path: "lang/eng.traineddata.gz", size: 3_000_000 },
    { code: "rus", path: "lang/rus.traineddata.gz", size: 2_700_000 },
  ],
};

let store: Map<string, Response>;
let fetched: string[];
let manifest: unknown;

beforeEach(() => {
  run.calls = [];
  run.fail = null;
  run.hang = false;
  run.result = { text: "Hello world\n", confidence: 91.4, pages: 1, details: [], table: null };
  store = new Map();
  fetched = [];
  manifest = MANIFEST;
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async (url: string) => store.get(url)?.clone(),
      put: async (url: string, response: Response) => void store.set(url, response),
      delete: async (url: string) => store.delete(url),
    }),
  });
  vi.stubGlobal("Worker", class {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("manifest.json")) return manifest ? new Response(JSON.stringify(manifest)) : new Response("", { status: 404 });
      fetched.push(url);
      return new Response(new Uint8Array(1000), { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    }),
  );
});
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
});

const text = () => document.body.textContent ?? "";
const button = (label: string | RegExp) =>
  [...document.querySelectorAll("button")].find((node) => (typeof label === "string" ? node.textContent?.trim() === label : label.test(node.textContent ?? ""))) as HTMLButtonElement | undefined;
const checkbox = (label: string) =>
  [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(label))?.querySelector<HTMLInputElement>("input")!;

const image = () => createAssetFromBytes("scan.png", new Uint8Array([137, 80, 78, 71]), "image");
const pdf = (): Asset => ({ ...createAssetFromBytes("doc.pdf", new Uint8Array([37, 80, 68, 70]), "pdf"), pdf: async () => ({ numPages: 5 }) as never });

function Host({ asset, lang = "en", outputs }: { asset: Asset; lang?: "en" | "ru"; outputs: OperationOutput[] }) {
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  return <OcrOperation lang={lang} assets={[asset]} params={params} setParams={(patch) => setParams((p) => ({ ...p, ...patch }))} onProduce={(o) => outputs.push(o)} />;
}

async function open(asset: Asset, lang: "en" | "ru" = "en") {
  const outputs: OperationOutput[] = [];
  const view = await mount(<Host asset={asset} lang={lang} outputs={outputs} />);
  await waitFor(() => expect(button(/Download|Recognize|Скачать|Распознать/)).toBeTruthy());
  return { view, outputs };
}

describe("OcrOperation — files", () => {
  it("is registered for the workbench", () => {
    expect(hasOperation("ocr.recognize")).toBe(true);
  });

  it("says what is missing, with the real size, and disables recognising until it is downloaded", async () => {
    const { view } = await open(image());
    expect(document.querySelector('[data-testid="ocr-status"]')?.textContent).toBe("To download: 6.8 MB");
    expect(button("Recognize text")!.disabled).toBe(true);
    expect(button(/^Download \(/)).toBeTruthy();
    view.unmount();
  });

  it("downloads exactly the worker, the engine and the chosen language, then allows recognising", async () => {
    const { view } = await open(image());
    await click(button(/^Download \(/)!);
    await waitFor(() => expect(button("Recognize text")!.disabled).toBe(false));
    expect(fetched).toHaveLength(3);
    expect(fetched.some((u) => u.endsWith("/worker.min.js"))).toBe(true);
    expect(fetched.some((u) => u.endsWith("/eng.traineddata.gz"))).toBe(true);
    expect(fetched.some((u) => u.includes("rus"))).toBe(false);
    expect(document.querySelector('[data-testid="ocr-status"]')?.textContent).toBe("Ready to use");
    view.unmount();
  });

  it("needs more downloads when another language is ticked, and cannot untick the last one", async () => {
    const { view } = await open(image());
    await click(button(/^Download \(/)!);
    await waitFor(() => expect(button("Recognize text")!.disabled).toBe(false));
    await click(checkbox("Russian"));
    await waitFor(() => expect(button("Recognize text")!.disabled).toBe(true));
    await click(button(/^Download \(/)!);
    await waitFor(() => expect(button("Recognize text")!.disabled).toBe(false));
    expect(fetched.filter((u) => u.includes("rus"))).toHaveLength(1);
    await click(checkbox("English"));
    await click(checkbox("Russian")); // the last one stays
    expect(checkbox("Russian").checked).toBe(true);
    view.unmount();
  });

  it("starts with Russian first for a Russian reader", async () => {
    const { view } = await open(image(), "ru");
    expect(checkbox("Русский").checked).toBe(true);
    expect(checkbox("Английский").checked).toBe(true);
    view.unmount();
  });

  it("removes the downloaded files on request", async () => {
    const { view } = await open(image());
    await click(button(/^Download \(/)!);
    await waitFor(() => expect(button("Remove downloaded files")).toBeTruthy());
    await click(button("Remove downloaded files")!);
    await waitFor(() => expect(text()).toContain("Removed."));
    expect(store.size).toBe(0);
    expect(button("Recognize text")!.disabled).toBe(true);
    view.unmount();
  });

  it("reports a failed download and lets the user try again", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith("manifest.json") ? new Response(JSON.stringify(MANIFEST)) : new Response("", { status: 503 }))));
    const { view } = await open(image());
    await click(button(/^Download \(/)!);
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("download failed"));
    expect(button(/^Download \(/)).toBeTruthy();
    view.unmount();
  });

  it("says so when this build ships no OCR files", async () => {
    manifest = null;
    const view = await mount(<Host asset={image()} outputs={[]} />);
    await waitFor(() => expect(text()).toContain("not part of this build"));
    view.unmount();
  });

  it("says so when the browser cannot run it", async () => {
    vi.stubGlobal("Worker", undefined);
    const view = await mount(<Host asset={image()} outputs={[]} />);
    await waitFor(() => expect(text()).toContain("cannot run text recognition"));
    view.unmount();
  });
});

describe("OcrOperation — recognising", () => {
  async function ready(asset: Asset, lang: "en" | "ru" = "en") {
    const opened = await open(asset, lang);
    await click(button(/^Download \(/)!);
    await waitFor(() => expect(button("Recognize text")!.disabled).toBe(false));
    return opened;
  }

  it("recognises an image, shows the text with its confidence and adds a text file to the outputs", async () => {
    const { view, outputs } = await ready(image());
    await click(button("Recognize text")!);
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Hello world\n"));
    expect(text()).toContain("Average confidence 91%");
    expect(text()).toContain("Added to your outputs as scan.txt.");
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ name: "scan.txt", type: "text/plain;charset=utf-8", kind: "text" });
    expect(new TextDecoder().decode(outputs[0]!.bytes)).toBe("Hello world\n");
    const call = run.calls[0]!;
    expect(call.languages).toEqual(["eng"]);
    expect(call.preprocess).toEqual({ contrast: true, blackWhite: false, enlarge: true });
    expect((call.source as { kind: string }).kind).toBe("image");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("passes the chosen options on", async () => {
    const { view } = await ready(image());
    await click(checkbox("Black and white"));
    await click(checkbox("Improve contrast"));
    await click(button("Recognize text")!);
    await waitFor(() => expect(run.calls).toHaveLength(1));
    expect(run.calls[0]!.preprocess).toEqual({ contrast: false, blackWhite: true, enlarge: true });
    view.unmount();
  });

  it("adds nothing to the outputs, and says so, when no text was found", async () => {
    run.result = { text: "  \n", confidence: 10, pages: 1, details: [], table: null };
    const { view, outputs } = await ready(image());
    await click(button("Recognize text")!);
    await waitFor(() => expect(text()).toContain("No text was found"));
    expect(outputs).toHaveLength(0);
    view.unmount();
  });

  it("shows an error when recognising fails", async () => {
    run.fail = new Error("out of memory");
    const { view, outputs } = await ready(image());
    await click(button("Recognize text")!);
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("out of memory"));
    expect(outputs).toHaveLength(0);
    view.unmount();
  });

  it("can be stopped while it works", async () => {
    run.hang = true;
    const { view, outputs } = await ready(image());
    await click(button("Recognize text")!);
    await waitFor(() => expect(button("Stop")).toBeTruthy());
    expect(text()).toContain("Reading page 1 of 1…");
    expect(document.querySelector("progress")?.getAttribute("value")).toBe("0.3");
    await click(button("Stop")!);
    await waitFor(() => expect(text()).toContain("Stopped."));
    expect(button("Recognize text")).toBeTruthy();
    expect(outputs).toHaveLength(0);
    view.unmount();
  });

  it("reads the chosen pages of a PDF, and refuses a bad range", async () => {
    const { view } = await ready(pdf());
    await waitFor(() => expect(text()).toContain("the file has 5"));
    const pages = [...document.querySelectorAll("input")].find((n) => n.getAttribute("aria-invalid") !== null)!;
    await import("../helpers/dom").then(({ type }) => type(pages, "2-3, 5"));
    await click(button("Recognize text")!);
    await waitFor(() => expect(run.calls).toHaveLength(1));
    expect((run.calls[0]!.source as { pages: number[] }).pages).toEqual([2, 3, 5]);
    expect(run.calls[0]!.markPages).toBe(true);

    await import("../helpers/dom").then(({ type }) => type(pages, "9"));
    expect(button("Recognize text")!.disabled).toBe(true);
    expect(text()).toContain("Check the page numbers");
    view.unmount();
  });
});
