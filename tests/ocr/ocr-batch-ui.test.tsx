// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OcrOperation } from "@/components/workbench/operations/OcrOperations";
import { createAssetFromBytes, type Asset } from "@/lib/workbench/asset";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

type BatchOptions = {
  sources: { id: number; blob: () => Promise<Blob> }[];
  onStart: (id: number) => void;
  onResult: (id: number, outcome: unknown) => void;
  onProgress: (progress: unknown) => void;
  signal?: AbortSignal;
} & Record<string, unknown>;

const batch = vi.hoisted(() => ({
  calls: [] as BatchOptions[],
  texts: {} as Record<number, string>,
  failIds: [] as number[],
  hangAfter: null as number | null,
}));
const saved = vi.hoisted(() => ({ files: [] as { blob: Blob; name: string }[] }));

vi.mock("@/lib/apps/file-open", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/apps/file-open")>()),
  saveBlob: (blob: Blob, name: string) => void saved.files.push({ blob, name }),
}));
vi.mock("@/lib/ocr/run", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ocr/run")>();
  return {
    ...actual,
    runOcr: async () => {
      throw new Error("a batch must not call runOcr once per file from the UI");
    },
    runOcrBatch: async (options: BatchOptions) => {
      batch.calls.push(options);
      options.onProgress({ fraction: 0.05, done: 0, total: options.sources.length, stage: "engine", id: null });
      let handled = 0;
      for (const source of options.sources) {
        if (batch.hangAfter !== null && handled >= batch.hangAfter) {
          await new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
        }
        options.onStart(source.id);
        await source.blob();
        if (batch.failIds.includes(source.id)) options.onResult(source.id, { ok: false, error: new Error("bad") });
        else options.onResult(source.id, { ok: true, result: { text: batch.texts[source.id] ?? `text ${source.id}\n`, confidence: 88, pages: 1, details: [], table: null } });
        handled += 1;
      }
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
  batch.calls = [];
  batch.texts = {};
  batch.failIds = [];
  batch.hangAfter = null;
  saved.files = [];
  store = new Map();
  vi.stubGlobal("caches", { open: async () => ({ match: async (url: string) => store.get(url)?.clone(), put: async (url: string, response: Response) => void store.set(url, response), delete: async (url: string) => store.delete(url) }) });
  vi.stubGlobal("Worker", class {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith("manifest.json") ? new Response(JSON.stringify(MANIFEST)) : new Response(new Uint8Array(100), { status: 200 }))));
});
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
});

const text = () => document.body.textContent ?? "";
const button = (label: string | RegExp) => [...document.querySelectorAll("button")].find((n) => (typeof label === "string" ? n.textContent?.trim() === label : label.test(n.textContent ?? ""))) as HTMLButtonElement | undefined;

const pictures = (n: number): Asset[] => Array.from({ length: n }, (_, i) => createAssetFromBytes(`page-${i + 1}.png`, new Uint8Array([137, 80, 78, 71, i]), "image"));

function Host({ assets }: { assets: Asset[] }) {
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  return <OcrOperation lang="en" assets={assets} params={params} setParams={(patch) => setParams((p) => ({ ...p, ...patch }))} />;
}

async function ready(assets: Asset[]) {
  const view = await mount(<Host assets={assets} />);
  await waitFor(() => expect(button(/^Download \(/)).toBeTruthy());
  await click(button(/^Download \(/)!);
  await waitFor(() => expect(button(/^Recognize \d/)!.disabled).toBe(false));
  return view;
}

describe("OCR of several pictures", () => {
  it("lists every picture and offers to read them all", async () => {
    const view = await ready(pictures(3));
    expect(text()).toContain("page-1.png");
    expect(text()).toContain("page-3.png");
    expect(button("Recognize 3 images")).toBeTruthy();
    // The page range and the single-file result do not apply to a batch.
    expect(document.querySelector("textarea")).toBeNull();
    view.unmount();
  });

  it("reads every picture with one run and shows each text under its picture", async () => {
    batch.texts = { 1: "alpha\n", 2: "bravo\n", 3: "charlie\n" };
    const view = await ready(pictures(3));
    await click(button("Recognize 3 images")!);
    await waitFor(() => expect(text()).toContain("3 of 3 read"));
    expect(batch.calls).toHaveLength(1);
    expect(batch.calls[0]!.sources).toHaveLength(3);
    expect(text()).toContain("alpha");
    expect(text()).toContain("charlie");
    expect(text()).toContain("Average confidence 88%");
    // Nothing is left to read, so there is no button to press again.
    expect(button(/^Recognize /)).toBeUndefined();
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("downloads one picture's text, all of them as a zip, or as one text file", async () => {
    batch.texts = { 1: "alpha\n", 2: "bravo\n" };
    const view = await ready(pictures(2));
    await click(button("Recognize 2 images")!);
    await waitFor(() => expect(button("Download all (.zip)")).toBeTruthy());

    await click(button("page-1.txt")!);
    expect(saved.files.at(-1)!.name).toBe("page-1.txt");
    expect(await saved.files.at(-1)!.blob.text()).toBe("alpha\n");

    await click(button("Download all (.zip)")!);
    await waitFor(() => expect(saved.files.some((f) => f.name === "recognized-text.zip")).toBe(true));
    const zip = saved.files.find((f) => f.name === "recognized-text.zip")!;
    expect(zip.blob.type).toBe("application/zip");
    expect(zip.blob.size).toBeGreaterThan(50);

    await click(button("Download one text file")!);
    const joined = await saved.files.at(-1)!.blob.text();
    expect(saved.files.at(-1)!.name).toBe("recognized-text.txt");
    expect(joined).toContain("--- page-1.png ---\nalpha");
    expect(joined).toContain("--- page-2.png ---\nbravo");
    view.unmount();
  });

  it("says which picture could not be read and offers to try the rest again", async () => {
    batch.failIds = [2];
    const view = await ready(pictures(3));
    await click(button("Recognize 3 images")!);
    await waitFor(() => expect(button("Recognize the remaining 1 image")).toBeTruthy());
    expect(text()).toContain("2 of 3 read");
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);

    batch.failIds = [];
    await click(button("Recognize the remaining 1 image")!);
    await waitFor(() => expect(text()).toContain("3 of 3 read"));
    // Only the unread picture is sent the second time.
    expect(batch.calls[1]!.sources.map((s) => s.id)).toEqual([2]);
    view.unmount();
  });

  it("can be stopped, keeps what was read, and carries on from there", async () => {
    batch.hangAfter = 1;
    const view = await ready(pictures(3));
    await click(button("Recognize 3 images")!);
    await waitFor(() => expect(button("Stop")).toBeTruthy());
    await waitFor(() => expect(text()).toContain("Reading 1 of 3"));
    await click(button("Stop")!);
    await waitFor(() => expect(text()).toContain("Stopped."));
    expect(text()).toContain("text 1");
    expect(button("Recognize the remaining 2 images")).toBeTruthy();

    batch.hangAfter = null;
    await click(button("Recognize the remaining 2 images")!);
    await waitFor(() => expect(text()).toContain("3 of 3 read"));
    view.unmount();
  });

  it("shows a page at a time for a long batch", async () => {
    const view = await ready(pictures(120));
    expect(document.querySelectorAll("li")).toHaveLength(50);
    await click(button(/^Show 50 more/)!);
    expect(document.querySelectorAll("li")).toHaveLength(100);
    expect(button("Recognize 120 images")).toBeTruthy();
    view.unmount();
  });
});
