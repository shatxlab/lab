import { describe, expect, it } from "vitest";

import { createAsset, type Asset } from "@/lib/workbench/asset";
import {
  STARTERS,
  capabilitiesFor,
  capabilityById,
  unlockedByAnother,
  type CapabilityId,
} from "@/lib/workbench/capabilities";
import type { AssetKind } from "@/lib/workbench/kinds";

function asset(kind: AssetKind, name = `file.${kind}`): Asset {
  return createAsset({ name, size: 0, arrayBuffer: async () => new ArrayBuffer(0) }, kind);
}

/** Offered ids for `selected` among `assets` (the selected file defaults to the first). */
const offeredIds = (assets: readonly Asset[], selected: Asset | null = assets[0] ?? null): CapabilityId[] =>
  capabilitiesFor(assets, selected).map((entry) => entry.capability.id);

/** The files a given capability would act on. */
const actsOn = (assets: readonly Asset[], selected: Asset, id: CapabilityId): string[] =>
  capabilitiesFor(assets, selected)
    .find((entry) => entry.capability.id === id)!
    .assets.map((entry) => entry.name);

describe("capabilitiesFor", () => {
  it("offers nothing until a file is selected", () => {
    expect(offeredIds([], null)).toEqual([]);
  });

  it("limits a single PDF to open, sign and split", () => {
    expect(offeredIds([asset("pdf")])).toEqual(["doc.open", "pdf.sign", "pdf.split"]);
  });

  it("adds Merge, over every open PDF, once there are two", () => {
    const a = asset("pdf", "a.pdf");
    const b = asset("pdf", "b.pdf");
    expect(offeredIds([a, b])).toEqual(["pdf.merge", "doc.open", "pdf.sign", "pdf.split"]);
    expect(actsOn([a, b], b, "pdf.merge")).toEqual(["a.pdf", "b.pdf"]);
  });

  it("opens documents, data and text, and offers a QR code for text", () => {
    expect(offeredIds([asset("text")])).toEqual(["doc.open", "qr.generate"]);
    expect(offeredIds([asset("json")])).toEqual(["doc.open", "qr.generate"]);
    expect(offeredIds([asset("sheet")])).toEqual(["doc.open"]);
    expect(offeredIds([asset("docx")])).toEqual(["doc.open"]);
  });

  it("compares exactly two comparable files", () => {
    const a = asset("text", "a.txt");
    const b = asset("docx", "b.docx");
    expect(offeredIds([a, b])[0]).toBe("text.diff");
    expect(actsOn([a, b], a, "text.diff")).toEqual(["a.txt", "b.docx"]);
    expect(offeredIds([a, b, asset("text", "c.txt")])).not.toContain("text.diff");
  });

  it("never compares PDFs, and leaves them out of a text comparison", () => {
    const pdf = asset("pdf", "a.pdf");
    const one = asset("text", "one.txt");
    const two = asset("text", "two.txt");
    expect(offeredIds([pdf, one, two], pdf)).not.toContain("text.diff");
    expect(actsOn([pdf, one, two], one, "text.diff")).toEqual(["one.txt", "two.txt"]);
  });

  it("keeps each file's own tools in a mixed selection", () => {
    const sheet = asset("sheet", "data.xlsx");
    const photo = asset("image", "photo.png");
    expect(offeredIds([sheet, photo], sheet)).toEqual(["doc.open"]);
    expect(offeredIds([sheet, photo], photo)).toEqual(["image.edit"]);
    expect(actsOn([sheet, photo], photo, "image.edit")).toEqual(["photo.png"]);
  });

  it("batches every open image into the image tool", () => {
    const one = asset("image", "one.png");
    const two = asset("image", "two.jpg");
    expect(actsOn([one, asset("text"), two], two, "image.edit")).toEqual(["one.png", "two.jpg"]);
  });

  it("reads an EPUB and offers nothing for unknown binaries", () => {
    expect(offeredIds([asset("epub")])).toEqual(["book.read"]);
    expect(offeredIds([asset("binary")])).toEqual([]);
  });
});

describe("unlockedByAnother", () => {
  const ids = (assets: readonly Asset[], selected: Asset | null = assets[0] ?? null) =>
    unlockedByAnother(assets, selected).map((capability) => capability.id);

  it("names what one more file of the selected kind would unlock", () => {
    expect(ids([asset("pdf")])).toEqual(["pdf.merge"]);
    expect(ids([asset("text")])).toEqual(["text.diff"]);
  });

  it("stays quiet when nothing is one file away", () => {
    expect(ids([asset("image")])).toEqual([]);
    expect(ids([asset("pdf", "a.pdf"), asset("pdf", "b.pdf")])).toEqual([]);
    expect(ids([asset("text", "a.txt"), asset("text", "b.txt")])).toEqual([]);
    expect(ids([], null)).toEqual([]);
  });
});

describe("registry", () => {
  it("offers compare and QR creation without a file", () => {
    expect(STARTERS.map((capability) => capability.id)).toEqual(["text.diff", "qr.generate"]);
  });

  it("looks a capability up by id", () => {
    expect(capabilityById("pdf.merge")?.set?.(2)).toBe(true);
    expect(capabilityById("nope" as CapabilityId)).toBeUndefined();
  });
});
