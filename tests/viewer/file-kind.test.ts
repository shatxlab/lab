// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  ACCEPTED_EXTENSIONS,
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

  it.each(["photo.png", "archive.zip", "slides.pptx", "README"])(
    "reads %s as unsupported",
    (name) => {
      expect(detectFileKind(name)).toBe("unsupported");
    },
  );

  it.each([
    ["notes.txt", "text"],
    ["build.log", "text"],
    ["data.json", "json"],
  ])("reads %s as %s by extension", (name, kind) => {
    expect(detectFileKind(name)).toBe(kind);
  });
});

describe("ACCEPTED_EXTENSIONS", () => {
  it("offers every kind the viewer can act on to the file picker", () => {
    expect(ACCEPTED_EXTENSIONS).toContain(".md");
    expect(ACCEPTED_EXTENSIONS).toContain(".xlsx");
    expect(ACCEPTED_EXTENSIONS).toContain(".csv");
    expect(ACCEPTED_EXTENSIONS).toContain(".docx");
    expect(ACCEPTED_EXTENSIONS).toContain(".txt");
    expect(ACCEPTED_EXTENSIONS).toContain(".log");
    expect(ACCEPTED_EXTENSIONS).toContain(".json");
    // .doc is accepted so the picker can hand it over and get a real explanation
    // instead of the OS greying the file out.
    expect(ACCEPTED_EXTENSIONS).toContain(".doc");
  });

  it("prefixes every entry with a dot", () => {
    expect(ACCEPTED_EXTENSIONS.every((entry) => entry.startsWith("."))).toBe(true);
  });
});

describe("fileKindLabel", () => {
  it("labels every kind", () => {
    expect(fileKindLabel("markdown")).toBe("Markdown");
    expect(fileKindLabel("sheet")).toBe("Spreadsheet");
    expect(fileKindLabel("docx")).toBe("Word");
    expect(fileKindLabel("text")).toBe("Text");
    expect(fileKindLabel("json")).toBe("JSON");
    expect(fileKindLabel("legacy-doc")).toBe("Word 97-2003");
  });
});
