// @vitest-environment jsdom
import { unzipSync } from "fflate";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImageTools from "@/components/tools/ImageTools";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";
import { buildJpeg } from "./fixtures";

const processImage = vi.fn();

vi.mock("@/lib/image/process", async () => {
  const actual = await vi.importActual<typeof import("@/lib/image/process")>("@/lib/image/process");
  return {
    ...actual,
    processImage: (...args: unknown[]) => processImage(...args),
    supportedOutputMimes: () => new Set(["image/png", "image/jpeg", "image/webp"]),
  };
});

let downloads: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  downloads = [];
  const blobs = new Map<string, Blob>();
  let counter = 0;
  URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:img-${(counter += 1)}`;
    blobs.set(url, blob);
    return url;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: blobs.get(this.href)! });
  });
  processImage.mockReset();
  processImage.mockImplementation(async (file: File, settings: { format: string }) => ({
    blob: new Blob([new Uint8Array(Math.floor(file.size / 2))], { type: "image/webp" }),
    name: `${file.name.replace(/\.\w+$/, "")}-min.${settings.format === "keep" ? "jpg" : settings.format}`,
    mime: "image/webp",
    width: 800,
    height: 600,
    notes: [],
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  localStorage.clear();
});

async function addFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const label = (text: string) => [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(text));
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLElement;
const photo = (name: string, size = 4000) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

describe("ImageTools", () => {
  it("processes added images and shows size savings", async () => {
    const view = await mount(<ImageTools />);
    await addFiles([photo("a.jpg", 2048)]);
    await waitFor(() => expect(document.body.textContent).toContain("a-min.jpg"));
    expect(document.body.textContent).toContain("2.0 KB");
    expect(document.body.textContent).toContain("50% smaller");
    expect(document.body.textContent).toContain("800 × 600 px");
    expect(document.querySelector<HTMLAnchorElement>("a[download]")?.download).toBe("a-min.jpg");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("reprocesses with new settings and remembers them", async () => {
    const view = await mount(<ImageTools />);
    await addFiles([photo("a.jpg")]);
    await waitFor(() => expect(processImage).toHaveBeenCalledTimes(1));
    expect(processImage.mock.calls[0]![1]).toMatchObject({ task: "convert", format: "keep" });

    await act(async () => {
      const select = label("Output format")!.querySelector("select")!;
      select.value = "webp";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => expect(processImage).toHaveBeenCalledTimes(2), 3000);
    expect(processImage.mock.calls[1]![1]).toMatchObject({ format: "webp" });
    expect(JSON.parse(localStorage.getItem("lab:image:v1")!).settings.format).toBe("webp");
    view.unmount();
  });

  it("switches to metadata-only mode and hides conversion options", async () => {
    const view = await mount(<ImageTools />);
    expect(label("Output format")).toBeTruthy();
    await click(document.querySelector('input[name="image-task"][type="radio"]:not(:checked)'));
    expect(label("Output format")).toBeUndefined();
    expect(document.body.textContent).toContain("keep their exact pixels");
    view.unmount();
  });

  it("warns about GPS in the original and lists what was found", async () => {
    const view = await mount(<ImageTools />);
    const file = new File([buildJpeg({ orientation: 6, withGps: true }) as unknown as BlobPart], "trip.jpg", { type: "image/jpeg" });
    await addFiles([file]);
    await waitFor(() => expect(document.body.textContent).toContain("Metadata found in the original"));
    const details = document.querySelector("details")!;
    expect(details.textContent).toContain("Canon");
    expect(details.textContent).toContain("55.75833, -37.60000");
    expect(details.textContent).toContain("reveals where this was taken");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("shows a readable error when processing fails", async () => {
    processImage.mockRejectedValue(Object.assign(new Error("decode"), { code: "decode", name: "ImageError" }));
    const view = await mount(<ImageTools />);
    await addFiles([photo("broken.jpg")]);
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("could not be read as an image"));
    view.unmount();
  });

  it("downloads several results as a zip with unique names, and removes items", async () => {
    processImage.mockImplementation(async (file: File) => ({
      blob: new Blob([file.name], { type: "image/png" }),
      name: "same.png",
      mime: "image/png",
      width: 1,
      height: 1,
      notes: [],
    }));
    const view = await mount(<ImageTools />);
    await addFiles([photo("one.jpg"), photo("two.jpg")]);
    await waitFor(() => expect(document.querySelectorAll("a[download]").length).toBe(2));
    await click(button("Download all (.zip)"));
    await waitFor(() => expect(downloads.map((d) => d.name)).toEqual(["images.zip"]));
    const zip = unzipSync(new Uint8Array(await downloads[0]!.blob.arrayBuffer()));
    expect(Object.keys(zip).sort()).toEqual(["same-2.png", "same.png"]);

    await click(document.querySelector('[aria-label="Remove one.jpg"]'));
    expect(document.querySelectorAll("a[download]").length).toBe(1);
    await click(button("Remove all"));
    expect(document.querySelectorAll("li").length).toBe(0);
    view.unmount();
  });
});
