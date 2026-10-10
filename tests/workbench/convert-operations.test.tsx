// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  DataConvertOperation,
  DataHashOperation,
  DataUuidOperation,
} from "@/components/workbench/operations/ConvertOperations";
import { createAssetFromText } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";
import { mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
});

const textareas = () => [...document.querySelectorAll("textarea")];

describe("workbench convert operations", () => {
  it("seeds the data converter from a JSON asset and writes YAML", async () => {
    const view = await mount(
      <DataConvertOperation lang="en" assets={[createAssetFromText("config.json", '{"a":1,"b":[true,null]}')]} />,
    );
    await waitFor(() => expect(textareas()[0]!.value).toContain('"a"'));
    await waitFor(() => {
      expect(textareas()[1]!.value).toContain("a: 1");
      expect(textareas()[1]!.value).toContain("b:");
    });
    view.unmount();
  });

  it("hashes the bytes of an asset", async () => {
    const view = await mount(<DataHashOperation lang="en" assets={[createAssetFromText("a.txt", "hello")]} />);
    await waitFor(() => {
      const codes = [...document.querySelectorAll("code")];
      expect(codes.some((code) => /^[0-9a-f]{64}$/.test(code.textContent ?? ""))).toBe(true);
    });
    view.unmount();
  });

  it("generates UUIDs without any asset", async () => {
    const view = await mount(<DataUuidOperation lang="en" assets={EMPTY_ASSETS} />);
    await waitFor(() => expect(textareas()[0]!.value).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/));
    view.unmount();
  });

  it("registers the convert capabilities", async () => {
    expect(hasOperation("data.convert")).toBe(true);
    expect(hasOperation("data.hash")).toBe(true);
    expect(await loadOperation("data.encode")).toBeTypeOf("function");
  });
});
