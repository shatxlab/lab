// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QrGenerateOperation, QrScanOperation } from "@/components/workbench/operations/QrOperations";
import { createAssetFromBytes, createAssetFromText } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";
import { mount, type, waitFor } from "../helpers/dom";

vi.mock("@/lib/qr/scan", () => ({
  decodeFrame: vi.fn(async () => null),
  decodeImageFile: vi.fn(async (file: File) => (file.name === "code.png" ? "https://example.com/asset" : null)),
}));

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({ fillRect() {}, drawImage() {}, fillStyle: "" })) as never;
});

afterEach(() => {
  document.body.innerHTML = "";
});

const textareas = () => [...document.querySelectorAll("textarea")];

describe("workbench QR operations", () => {
  it("generates a code from plain text input", async () => {
    const view = await mount(<QrGenerateOperation lang="en" assets={EMPTY_ASSETS} />);
    await type(textareas()[0]!, "hello from the workbench");
    await waitFor(() => expect(document.querySelector('canvas[role="img"]')).toBeTruthy());
    view.unmount();
  });

  it("seeds the generator text from a textual asset and hides its picker", async () => {
    const view = await mount(
      <QrGenerateOperation lang="en" assets={[createAssetFromText("note.txt", "seeded from a file")]} />,
    );
    await waitFor(() => expect(textareas()[0]!.value).toBe("seeded from a file"));
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("renders the scanner standalone without an asset", async () => {
    const view = await mount(<QrScanOperation lang="en" assets={EMPTY_ASSETS} />);
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Start camera");
    view.unmount();
  });

  it("decodes an image asset and hands the result to onUse", async () => {
    const onUse = vi.fn();
    const asset = createAssetFromBytes("code.png", new Uint8Array([137, 80, 78, 71]), "image");
    const view = await mount(<QrScanOperation lang="en" assets={[asset]} onUse={onUse} />);
    await waitFor(() => expect(onUse).toHaveBeenCalledWith("https://example.com/asset"));
    expect(document.body.textContent).toContain("https://example.com/asset");
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("registers the QR capabilities", async () => {
    expect(hasOperation("qr.generate")).toBe(true);
    expect(hasOperation("qr.scan")).toBe(true);
    expect(await loadOperation("qr.scan")).toBeTypeOf("function");
  });
});
