import { describe, expect, it } from "vitest";

import {
  assetKindFromFileKind,
  dataFormatFor,
  detectAssetKind,
  isComparable,
  isDataAssetKind,
  isEditable,
  isTextual,
} from "@/lib/workbench/kinds";

describe("detectAssetKind", () => {
  it.each([
    ["report.pdf", "pdf"],
    ["notes.md", "markdown"],
    ["contract.docx", "docx"],
    ["book.xlsx", "sheet"],
    ["data.csv", "sheet"],
    ["page.html", "html"],
    ["readme.txt", "text"],
    ["config.json", "json"],
    ["config.yaml", "yaml"],
    ["config.yml", "yaml"],
    ["Cargo.toml", "toml"],
    ["photo.png", "image"],
    ["novel.epub", "epub"],
    ["archive.zip", "binary"],
    ["holiday.mp4", "binary"],
  ])("reads %s as %s", (name, kind) => {
    expect(detectAssetKind(name)).toBe(kind);
  });

  it("keeps an EPUB an EPUB even though its bytes are a zip", () => {
    expect(detectAssetKind("novel.epub", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("epub");
  });

  it("sniffs extension-less JSON from its bytes", () => {
    const bytes = new TextEncoder().encode('{"a":1}');
    expect(detectAssetKind("payload", bytes)).toBe("json");
  });

  it("maps legacy .doc to the binary bucket", () => {
    expect(detectAssetKind("contract.doc")).toBe("binary");
    expect(assetKindFromFileKind("legacy-doc")).toBe("binary");
  });
});

describe("asset kind predicates", () => {
  it("knows which kinds are editable", () => {
    expect(isEditable("markdown")).toBe(true);
    expect(isEditable("json")).toBe(true);
    expect(isEditable("sheet")).toBe(true);
    expect(isEditable("pdf")).toBe(false);
    expect(isEditable("docx")).toBe(false);
    expect(isEditable("image")).toBe(false);
  });

  it("knows which kinds are textual", () => {
    expect(isTextual("yaml")).toBe(true);
    expect(isTextual("toml")).toBe(true);
    expect(isTextual("sheet")).toBe(false);
    expect(isTextual("image")).toBe(false);
  });

  it("knows which kinds can be compared", () => {
    expect(isComparable("pdf")).toBe(true);
    expect(isComparable("docx")).toBe(true);
    expect(isComparable("sheet")).toBe(true);
    expect(isComparable("image")).toBe(false);
    expect(isComparable("binary")).toBe(false);
  });

  it("separates the structured data formats", () => {
    expect(isDataAssetKind("json")).toBe(true);
    expect(isDataAssetKind("yaml")).toBe(true);
    expect(isDataAssetKind("toml")).toBe(true);
    expect(isDataAssetKind("text")).toBe(false);
    expect(dataFormatFor("toml")).toBe("toml");
  });
});
