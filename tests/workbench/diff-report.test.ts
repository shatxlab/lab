import { describe, expect, it } from "vitest";
import { diffFileStem, diffPatchOutput, diffReportOutput } from "@/lib/text/diff-report";

describe("diffFileStem", () => {
  it("joins the two names with -vs-", () => {
    expect(diffFileStem("a.txt", "b.txt")).toBe("a-vs-b");
  });

  it("keeps one stem when the names slug to the same value", () => {
    expect(diffFileStem("a b.txt", "a-b.txt")).toBe("a-b");
  });

  it("falls back to a safe stem for empty names", () => {
    expect(diffFileStem("", "")).toBe("compare");
  });
});

describe("diffPatchOutput", () => {
  it("produces a .patch file with the unified diff text", () => {
    const output = diffPatchOutput("old.md", "new.md", "diff --git a/old.md b/new.md");
    expect(output.name).toBe("old-vs-new.patch");
    expect(output.type).toBe("text/x-diff");
    expect(output.kind).toBe("text");
    expect(new TextDecoder().decode(output.bytes)).toBe("diff --git a/old.md b/new.md");
  });
});

describe("diffReportOutput", () => {
  it("produces a self-contained HTML report", () => {
    const output = diffReportOutput("en", "old.md", "new.md", "diff body & <more>", "Added: 1, removed: 2");
    expect(output.name).toBe("old-vs-new-diff.html");
    expect(output.type).toBe("text/html");
    expect(output.kind).toBe("html");
    const html = new TextDecoder().decode(output.bytes);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Text comparison");
    expect(html).toContain("old.md → new.md · Added: 1, removed: 2");
    expect(html).toContain("diff body &amp; &lt;more&gt;");
  });

  it("escapes names and allows an empty summary", () => {
    const output = diffReportOutput("ru", "<b>old</b>.txt", "new.txt", "", "");
    const html = new TextDecoder().decode(output.bytes);
    expect(html).toContain("&lt;b&gt;old&lt;/b&gt;.txt → new.txt");
    expect(html).not.toContain("<b>old</b>");
  });
});
