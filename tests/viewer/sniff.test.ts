// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { buildDocx } from "./fixtures/docx";
import { xlsBuffer, xlsxBuffer } from "./fixtures/sheet";
import { resolveFileKind } from "@/lib/viewer/file-kind";
import { sniffOfficeKind } from "@/lib/viewer/sniff";

describe("sniffOfficeKind", () => {
  it("recognises an xlsx package", () => {
    const bytes = new Uint8Array(xlsxBuffer({ Sheet1: [["a"]] }));
    expect(sniffOfficeKind(bytes)).toBe("sheet");
  });

  it("recognises a docx package", async () => {
    const bytes = new Uint8Array(await buildDocx());
    expect(sniffOfficeKind(bytes)).toBe("docx");
  });

  it("recognises a real .xls workbook", () => {
    const bytes = new Uint8Array(xlsBuffer({ Лист1: [["a"]] }));
    expect(sniffOfficeKind(bytes)).toBe("sheet");
  });

  it("leaves a random ZIP alone", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("hello.txt")]);
    expect(sniffOfficeKind(bytes)).toBe("unsupported");
  });

  it("leaves empty bytes unsupported", () => {
    expect(sniffOfficeKind(new Uint8Array())).toBe("unsupported");
  });
});

describe("resolveFileKind", () => {
  it("sniffs an Office file whose name has no extension", () => {
    const bytes = new Uint8Array(xlsxBuffer({ Sheet1: [["a"]] }));
    expect(resolveFileKind("export", bytes)).toBe("sheet");
  });

  it("trusts a known extension over the bytes", () => {
    const bytes = new Uint8Array(xlsxBuffer({ Sheet1: [["a"]] }));
    expect(resolveFileKind("notes.md", bytes)).toBe("markdown");
  });

  it("sniffs an extension-less JSON document from its `{` head", () => {
    const bytes = new TextEncoder().encode('{"city": "Berlin"}');
    expect(resolveFileKind("export", bytes)).toBe("json");
  });

  it("sniffs an extension-less JSON array too, after a BOM", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('[1, 2]')]);
    expect(resolveFileKind("export", withBom)).toBe("json");
  });

  it("leaves non-JSON text without an extension unsupported", () => {
    const bytes = new TextEncoder().encode("plain log line");
    expect(resolveFileKind("export", bytes)).toBe("unsupported");
  });

  it("still trusts a known name over JSON-looking bytes", () => {
    const bytes = new TextEncoder().encode('{"looks": "like json"}');
    expect(resolveFileKind("notes.txt", bytes)).toBe("text");
  });
});

describe("binary sniffing for extension-less files", () => {
  it.each([
    ["pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]],
    ["image", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]],
    ["image", [0xff, 0xd8, 0xff, 0xe0, 0, 0]],
    ["image", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ["image", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])("resolves a nameless %s", (kind, bytes) => {
    expect(resolveFileKind("download", new Uint8Array(bytes))).toBe(kind);
  });

  it("does not take a RIFF/WAV file for an image", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(resolveFileKind("sound", wav)).toBe("unsupported");
  });
});
