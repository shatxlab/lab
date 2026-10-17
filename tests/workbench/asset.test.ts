import { describe, expect, it, vi } from "vitest";

import { createAsset, createAssetFromBytes, createAssetFromText } from "@/lib/workbench/asset";

function source(text: string, name: string) {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer as ArrayBuffer };
}

describe("createAsset", () => {
  it("wraps in-memory text and detects its kind", async () => {
    const asset = createAssetFromText("notes.md", "# Title");
    expect(asset.kind).toBe("markdown");
    expect(asset.name).toBe("notes.md");
    expect(asset.extension).toBe("md");
    expect(await asset.text()).toBe("# Title");
  });

  it("parses JSON, YAML and TOML through json()", async () => {
    expect(await createAsset(source('{"a":1}', "data.json")).json()).toEqual({ a: 1 });
    expect(await createAsset(source("a: 1\n", "config.yaml")).json()).toEqual({ a: 1 });
    expect(await createAsset(source("a = 1\n", "config.toml")).json()).toEqual({ a: 1 });
  });

  it("parses JSON text for a non-data kind without a format", async () => {
    const asset = createAsset(source('{"a":1}', "payload.txt"));
    expect(asset.kind).toBe("text");
    expect(await asset.json()).toEqual({ a: 1 });
  });

  it("keeps an explicit kind when there is no filename to sniff", async () => {
    const asset = createAssetFromBytes("paste", new TextEncoder().encode("hello"), "text");
    expect(asset.kind).toBe("text");
    expect(asset.extension).toBe("");
    expect(await asset.text()).toBe("hello");
  });

  it("reads the underlying buffer only once", async () => {
    const arrayBuffer = vi.fn(async () => new TextEncoder().encode("hi").buffer as ArrayBuffer);
    const asset = createAsset({ name: "a.txt", size: 2, arrayBuffer });

    await asset.bytes();
    await asset.text();
    await asset.bytes();

    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("hands back the original file as a Blob without reading it", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(4));
    const original = new Blob([new Uint8Array(4)], { type: "image/png" });
    const asset = createAsset({ name: "p.png", size: 4, blob: original, arrayBuffer });

    expect(await asset.toBlob()).toBe(original);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("builds a Blob from the bytes when there is no original file", async () => {
    const asset = createAssetFromBytes("p.png", new Uint8Array([1, 2, 3]), "image");
    const blob = await asset.toBlob();
    expect(blob.size).toBe(3);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});
