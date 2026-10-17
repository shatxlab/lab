// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageOperation } from "@/components/workbench/operations/ImageOperations";
import { createAsset, type Asset } from "@/lib/workbench/asset";
import { click, mount, waitFor } from "../helpers/dom";

const processImage = vi.hoisted(() => vi.fn());
const saved = vi.hoisted(() => ({ files: [] as { blob: Blob; name: string }[] }));

vi.mock("@/lib/image/process", async () => {
  const actual = await vi.importActual<typeof import("@/lib/image/process")>("@/lib/image/process");
  return {
    ...actual,
    processImage: (...args: unknown[]) => processImage(...args),
    supportedOutputMimes: () => new Set(["image/png", "image/jpeg", "image/webp"]),
  };
});
vi.mock("@/lib/apps/file-open", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/apps/file-open")>()),
  saveBlob: (blob: Blob, name: string) => void saved.files.push({ blob, name }),
}));

/** Reads of the original bytes: a batch must never need any. */
const reads = vi.hoisted(() => ({ count: 0 }));

/** An image asset backed by a file, the way a dropped photo is. */
function photo(name: string): Asset {
  return createAsset(
    {
      name,
      size: 1000,
      type: "image/jpeg",
      blob: new Blob([new Uint8Array(1000)], { type: "image/jpeg" }),
      arrayBuffer: async () => {
        reads.count += 1;
        return new ArrayBuffer(1000);
      },
    },
    "image",
  );
}
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(`IMG_${String(i + 1).padStart(4, "0")}.jpg`));

let inFlight = 0;
let maxInFlight = 0;
const finish = (file: File, delay = 0) =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          blob: new Blob([new Uint8Array(300)], { type: "image/webp" }),
          name: file.name.replace(/\.jpg$/, "-min.webp"),
          mime: "image/webp",
          width: 100,
          height: 80,
          notes: [],
        }),
      delay,
    ),
  );

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  reads.count = 0;
  saved.files = [];
  processImage.mockReset();
  processImage.mockImplementation(async (file: File) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      return await finish(file, 2);
    } finally {
      inFlight -= 1;
    }
  });
});
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const text = () => document.body.textContent ?? "";
const button = (label: string | RegExp) =>
  [...document.querySelectorAll("button")].find((node) => (typeof label === "string" ? node.textContent?.trim() === label : label.test(node.textContent ?? ""))) as HTMLButtonElement | undefined;

describe("image batch — from ten images", () => {
  it("waits for the button instead of processing as soon as the files arrive", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(12)} />);
    await waitFor(() => expect(text()).toContain("12 images ready"));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(processImage).not.toHaveBeenCalled();
    expect(button("Process 12 images")).toBeTruthy();
    view.unmount();
  });

  it("still follows the settings live below ten images", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(9)} />);
    await waitFor(() => expect(processImage).toHaveBeenCalledTimes(9));
    expect(button(/^Process /)).toBeUndefined();
    view.unmount();
  });

  it("does not restart when a setting changes", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(10)} />);
    await waitFor(() => expect(button("Process 10 images")).toBeTruthy());
    await click(document.querySelector('input[name="image-task"][type="radio"]:not(:checked)'));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(processImage).not.toHaveBeenCalled();
    view.unmount();
  });

  it("processes everything a few at a time, never all at once", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(24)} />);
    await click(await waitForButton("Process 24 images"));
    await waitFor(() => expect(text()).toContain("24 of 24 done"));
    expect(processImage).toHaveBeenCalledTimes(24);
    expect(maxInFlight).toBeGreaterThanOrEqual(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    view.unmount();
  });

  it("never reads the originals into memory itself", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(12)} />);
    await click(await waitForButton("Process 12 images"));
    await waitFor(() => expect(text()).toContain("12 of 12 done"));
    // processImage is mocked, so any read here would be the operation copying files up front.
    expect(reads.count).toBe(0);
    view.unmount();
  });

  it("shows one row per image, fifty at a time", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(120)} />);
    await waitFor(() => expect(text()).toContain("120 images ready"));
    expect(document.querySelectorAll("section[aria-labelledby='image-results'] > ul > li")).toHaveLength(50);
    await click(button(/^Show 50 more/));
    expect(document.querySelectorAll("section[aria-labelledby='image-results'] > ul > li")).toHaveLength(100);
    await click(button(/^Show 20 more/));
    expect(document.querySelectorAll("section[aria-labelledby='image-results'] > ul > li")).toHaveLength(120);
    expect(button(/^Show /)).toBeUndefined();
    view.unmount();
  });

  it("can be stopped, and carries on with what is left", async () => {
    processImage.mockImplementation(async (file: File) => finish(file, 25));
    const view = await mount(<ImageOperation lang="en" assets={photos(30)} />);
    await click(await waitForButton("Process 30 images"));
    await waitFor(() => expect(button("Stop")).toBeTruthy());
    await waitFor(() => expect(processImage.mock.calls.length).toBeGreaterThanOrEqual(3));
    await click(button("Stop"));
    await waitFor(() => expect(button(/^Process the remaining \d+ images?$/)).toBeTruthy());
    const doneBefore = Number(/(\d+) of 30/.exec(text())?.[1]);
    expect(doneBefore).toBeGreaterThan(0);
    expect(doneBefore).toBeLessThan(30);

    const startedBefore = processImage.mock.calls.length;
    await click(button(/^Process the remaining/));
    await waitFor(() => expect(text()).toContain("30 of 30 done"));
    // Nothing that already had a result was processed again.
    const names = processImage.mock.calls.map((call) => (call[0] as File).name);
    expect(new Set(names).size).toBeGreaterThanOrEqual(30);
    expect(processImage.mock.calls.length - startedBefore).toBeLessThanOrEqual(30 - doneBefore + 3);
    view.unmount();
  });

  it("shows each image's own size until it is processed, and offers the zip only when the run is over", async () => {
    // The first four finish at once; the rest wait until the test lets them go.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let started = 0;
    processImage.mockImplementation(async (file: File) => {
      started += 1;
      if (started > 4) await gate;
      return finish(file);
    });
    const view = await mount(<ImageOperation lang="en" assets={photos(12)} />);
    await waitFor(() => expect(text()).toContain("12 images ready"));
    // Not queued yet, so not "Waiting…": the row says how big the original is.
    expect(text()).not.toContain("Waiting…");
    expect(text()).toContain("1000 B");
    await click(button("Process 12 images"));
    await waitFor(() => expect(text()).toContain("Processing 4 of 12"));
    expect(button("Stop")).toBeTruthy();
    // Four results exist, but a half-finished batch is not offered as a zip.
    expect(button(/^Download all/)).toBeUndefined();
    release();
    await waitFor(() => expect(text()).toContain("12 of 12 done"));
    expect(button(/^Download all/)).toBeTruthy();
    view.unmount();
  });

  it("reports the images that failed and tries only those again", async () => {
    processImage.mockImplementation(async (file: File) => {
      if (file.name === "IMG_0003.jpg") throw Object.assign(new Error("decode"), { code: "decode", name: "ImageError" });
      return finish(file);
    });
    const view = await mount(<ImageOperation lang="en" assets={photos(10)} />);
    await click(await waitForButton("Process 10 images"));
    await waitFor(() => expect(button("Process the remaining 1 image")).toBeTruthy());
    expect(text()).toContain("9 of 10 done");
    expect(text()).toContain("1 could not be processed");

    processImage.mockClear();
    processImage.mockImplementation(async (file: File) => finish(file));
    await click(button("Process the remaining 1 image"));
    await waitFor(() => expect(text()).toContain("10 of 10 done"));
    expect(processImage).toHaveBeenCalledTimes(1);
    expect((processImage.mock.calls[0]![0] as File).name).toBe("IMG_0003.jpg");
    view.unmount();
  });

  it("marks results made with other settings as outdated, and processes them again on request", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(10)} />);
    await click(await waitForButton("Process 10 images"));
    await waitFor(() => expect(text()).toContain("10 of 10 done"));
    expect(button(/^Process /)).toBeUndefined();

    await click(document.querySelector('input[name="image-task"][type="radio"]:not(:checked)'));
    await waitFor(() => expect(button("Process 10 images")).toBeTruthy());
    expect(text()).toContain("Outdated");
    expect(text()).toContain("settings changed");

    processImage.mockClear();
    await click(button("Process 10 images"));
    await waitFor(() => expect(processImage).toHaveBeenCalledTimes(10));
    view.unmount();
  });

  it("packs the results into a zip without a second list to download them from", async () => {
    const view = await mount(<ImageOperation lang="en" assets={photos(10)} />);
    await click(await waitForButton("Process 10 images"));
    await waitFor(() => expect(text()).toContain("10 of 10 done"));
    await click(button("Download all (.zip)"));
    await waitFor(() => expect(saved.files.length).toBe(1));
    expect(saved.files[0]!.name).toBe("images.zip");
    const head = new Uint8Array(await saved.files[0]!.blob.arrayBuffer()).slice(0, 4);
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(saved.files[0]!.blob.size).toBeGreaterThan(10 * 300);
    view.unmount();
  });
});

async function waitForButton(label: string): Promise<HTMLButtonElement> {
  await waitFor(() => expect(button(label)).toBeTruthy());
  return button(label)!;
}
