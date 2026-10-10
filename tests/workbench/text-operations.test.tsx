// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { TextDiffOperation } from "@/components/workbench/operations/TextOperations";
import { createAssetFromText } from "@/lib/workbench/asset";
import type { CapabilityId } from "@/lib/workbench/capabilities";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("workbench compare operation", () => {
  it("seeds a diff from two text assets", async () => {
    const view = await mount(
      <TextDiffOperation
        lang="en"
        assets={[createAssetFromText("a.txt", "one\ntwo\nthree"), createAssetFromText("b.txt", "one\n2\nthree")]}
      />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("1 added, 1 removed"));
    view.unmount();
  });

  it("compares JSON by content, not layout", async () => {
    const view = await mount(
      <TextDiffOperation
        lang="en"
        assets={[createAssetFromText("a.json", '{"a":1,"b":[2,3]}'), createAssetFromText("b.json", '{\n  "a": 1,\n  "b": [2, 3]\n}')]}
      />,
    );
    // Both sides are pretty-printed before diffing, so only whitespace differed.
    await waitFor(() => expect(document.querySelectorAll("textarea")[0]!.value).toContain('"a": 1'));
    expect(document.querySelectorAll("textarea")[0]!.value).toBe(document.querySelectorAll("textarea")[1]!.value);
    view.unmount();
  });

  it("registers the text capabilities in the operation registry", async () => {
    expect(hasOperation("text.diff")).toBe(true);
    // Unknown capability ids are never registered (there is no component to load).
    expect(hasOperation("nonexistent.operation" as CapabilityId)).toBe(false);
    expect(await loadOperation("text.diff")).toBeTypeOf("function");
    expect(await loadOperation("nonexistent.operation" as CapabilityId)).toBeNull();
  });
});
