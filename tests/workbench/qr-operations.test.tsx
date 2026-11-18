// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QrGenerateOperation } from "@/components/workbench/operations/QrOperations";
import { createAssetFromText } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";
import { mount, type, waitFor } from "../helpers/dom";

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({ fillRect() {}, drawImage() {}, fillStyle: "" })) as never;
});

afterEach(() => {
  document.body.innerHTML = "";
});

const textareas = () => [...document.querySelectorAll("textarea")];

describe("workbench QR operation", () => {
  it("generates a code from plain text input", async () => {
    const view = await mount(<QrGenerateOperation lang="en" assets={EMPTY_ASSETS} />);
    await type(textareas()[0]!, "hello from the workbench");
    await waitFor(() => expect(document.querySelector('canvas[role="img"]')).toBeTruthy());
    view.unmount();
  });

  it("seeds the generator text from a textual asset", async () => {
    const view = await mount(
      <QrGenerateOperation lang="en" assets={[createAssetFromText("note.txt", "seeded from a file")]} />,
    );
    await waitFor(() => expect(textareas()[0]!.value).toBe("seeded from a file"));
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("registers the QR capability", async () => {
    expect(hasOperation("qr.generate")).toBe(true);
    expect(await loadOperation("qr.generate")).toBeTypeOf("function");
  });
});
