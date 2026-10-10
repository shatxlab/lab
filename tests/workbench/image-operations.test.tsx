// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageOperation } from "@/components/workbench/operations/ImageOperations";
import { createAssetFromBytes } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";
import { click, mount, waitFor } from "../helpers/dom";

const processImage = vi.fn();

vi.mock("@/lib/image/process", async () => {
  const actual = await vi.importActual<typeof import("@/lib/image/process")>("@/lib/image/process");
  return {
    ...actual,
    processImage: (...args: unknown[]) => processImage(...args),
    supportedOutputMimes: () => new Set(["image/png", "image/jpeg", "image/webp"]),
  };
});

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:image-operation") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  processImage.mockReset();
  // jsdom has no canvas, so a real decode would fail; make it fail explicitly.
  processImage.mockRejectedValue(Object.assign(new Error("decode"), { code: "decode", name: "ImageError" }));
});

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const label = (text: string) => [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(text));

describe("workbench image operation", () => {
  it("lists an image asset by filename without a picker", async () => {
    const asset = createAssetFromBytes("holiday.png", new Uint8Array([137, 80, 78, 71]), "image");
    const view = await mount(<ImageOperation lang="en" assets={[asset]} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("holiday.png");
      expect(document.body.textContent).toContain("could not be read as an image");
    });
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("hides the format controls when defaultTask is strip", async () => {
    const view = await mount(<ImageOperation lang="en" assets={EMPTY_ASSETS} defaultTask="strip" />);
    expect(label("Output format")).toBeUndefined();
    expect(document.body.textContent).toContain("keep their exact pixels");
    view.unmount();
  });

  it("initialises strip mode from params and reports task changes to setParams", async () => {
    const setParams = vi.fn();
    const view = await mount(<ImageOperation lang="en" assets={EMPTY_ASSETS} params={{ task: "strip" }} setParams={setParams} />);
    expect(label("Output format")).toBeUndefined();
    await click(document.querySelector('input[name="image-task"][type="radio"]:not(:checked)'));
    expect(setParams).toHaveBeenCalledWith({ task: "convert" });
    view.unmount();
  });

  it("publishes a finished result through onProduce", async () => {
    processImage.mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
      name: "holiday-min.webp",
      mime: "image/webp",
      width: 10,
      height: 10,
      notes: [],
    });
    const onProduce = vi.fn();
    const asset = createAssetFromBytes("holiday.png", new Uint8Array([137, 80, 78, 71]), "image");
    const view = await mount(<ImageOperation lang="en" assets={[asset]} onProduce={onProduce} />);
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    expect(onProduce).toHaveBeenCalledWith(expect.objectContaining({ name: "holiday-min.webp", type: "image/webp", kind: "image" }));
    expect([...(onProduce.mock.calls[0]![0].bytes as Uint8Array)]).toEqual([1, 2, 3]);
    view.unmount();
  });

  it("registers the image capabilities against this operation", async () => {
    expect(hasOperation("image.convert")).toBe(true);
    expect(hasOperation("image.transform")).toBe(true);
    expect(hasOperation("image.strip")).toBe(true);
    expect(await loadOperation("image.strip")).toBeTypeOf("function");
  });
});
