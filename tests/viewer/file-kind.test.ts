// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  detectFileKind,
  fileExtension,
  fileKindLabel,
} from "@/lib/viewer/file-kind";

describe("fileExtension", () => {
  it("lowercases the extension", () => {
    expect(fileExtension("Report.XLSX")).toBe("xlsx");
  });

  it("takes the last segment of a dotted name", () => {
    expect(fileExtension("2026.q1.report.final.csv")).toBe("csv");
  });

  it("ignores directories in the path", () => {
    expect(fileExtension("archive.old/notes.md")).toBe("md");
  });

  it("returns nothing for a name without an extension", () => {
    expect(fileExtension("README")).toBe("");
  });

  it("does not treat a dotfile as an extension", () => {
    expect(fileExtension(".gitignore")).toBe("");
  });
});

describe("detectFileKind", () => {
  it.each(["notes.md", "notes.markdown", "notes.mdown", "notes.mkd"])(
    "reads %s as markdown",
    (name) => {
      expect(detectFileKind(name)).toBe("markdown");
    },
  );

  it.each(["book.xlsx", "book.xlsm", "book.xlsb", "book.xls", "data.csv", "data.tsv", "book.ods"])(
    "reads %s as a spreadsheet",
    (name) => {
      expect(detectFileKind(name)).toBe("sheet");
    },
  );

  it("reads .docx as a Word document", () => {
    expect(detectFileKind("contract.docx")).toBe("docx");
  });

  it("separates legacy .doc so it can get its own explanation", () => {
    expect(detectFileKind("contract.doc")).toBe("legacy-doc");
    expect(detectFileKind("CONTRACT.DOC")).toBe("legacy-doc");
  });

  it.each(["archive.zip", "slides.pptx", "README", "movie.mp4"])(
    "reads %s as unsupported",
    (name) => {
      expect(detectFileKind(name)).toBe("unsupported");
    },
  );

  it.each([
    ["report.pdf", "pdf"],
    ["photo.png", "image"],
    ["photo.JPEG", "image"],
    ["logo.svg", "image"],
    ["page.html", "html"],
    ["page.htm", "html"],
    ["notes.txt", "text"],
    ["build.log", "text"],
    ["data.json", "json"],
  ])("reads %s as %s by extension", (name, kind) => {
    expect(detectFileKind(name)).toBe(kind);
  });
});
