// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";

import EpubReader from "@/components/apps/EpubReader";
import { openFiles, type FileSource } from "@/lib/apps/file-open";
import { EPUB_READER_STORAGE_KEY } from "@/lib/apps/epub-reader-state";

vi.mock("@/lib/apps/file-open", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apps/file-open")>();
  return { ...actual, openFiles: vi.fn() };
});

const openFilesMock = vi.mocked(openFiles);

function epub(entries: Record<string, string | Uint8Array>): Uint8Array {
  const zipEntries: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) {
    zipEntries[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(zipEntries, { level: 0 });
}

function source(bytes: Uint8Array, name = "reader.epub"): FileSource {
  const file = new File([bytes as unknown as BlobPart], name, {
    type: "application/epub+zip",
    lastModified: 1234,
  });
  return { file, readSlice: async () => bytes };
}

function bookBytes(): Uint8Array {
  return epub({
    "META-INF/container.xml": `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
      </container>`,
    "OPS/package.opf": `<?xml version="1.0"?>
      <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>Rendered Book</dc:title>
          <dc:creator>Case Writer</dc:creator>
        </metadata>
        <manifest>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
          <item id="one" href="one.xhtml" media-type="application/xhtml+xml"/>
          <item id="two" href="two.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine><itemref idref="one"/><itemref idref="two"/></spine>
      </package>`,
    "OPS/nav.xhtml": `<html><body><nav type="toc"><ol>
      <li><a href="one.xhtml">Start here</a></li>
      <li><a href="two.xhtml">Security chapter</a></li>
    </ol></nav></body></html>`,
    "OPS/one.xhtml": `<html><body><h1>Start here</h1><p>First rendered chapter.</p><p>Alpha searchable sentence.</p></body></html>`,
    "OPS/two.xhtml": `<html><body><h1>Security chapter</h1><p>Second rendered chapter with security marker.</p><script>window.__epubXss=1</script><img alt="remote" src="https://tracker.invalid/pixel.png"/></body></html>`,
  });
}

async function waitFor(assert: () => void) {
  const deadline = Date.now() + 3000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assert();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }
  }
  throw lastError;
}

async function mount(ui: ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function openBook(container: HTMLElement, fileSource = source(bookBytes())) {
  openFilesMock.mockResolvedValue([fileSource]);
  const openButton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Open EPUB"),
  );
  expect(openButton).toBeTruthy();
  await act(async () => {
    openButton!.click();
  });
  await waitFor(() => {
    expect(container.textContent).toContain("Rendered Book");
    expect(container.textContent).toContain("First rendered chapter.");
  });
}

function storageJson(): unknown {
  return JSON.parse(localStorage.getItem(EPUB_READER_STORAGE_KEY) ?? "{}");
}

describe("EpubReader", () => {
  beforeEach(() => {
    openFilesMock.mockReset();
    localStorage.clear();
    delete (window as { __epubXss?: unknown }).__epubXss;
  });

  it("opens an EPUB and immediately renders text without a chapter-select step", async () => {
    const { container, unmount } = await mount(<EpubReader />);
    try {
      expect(container.textContent).toContain("Open a book and start reading immediately.");

      await openBook(container);

      expect(container.textContent).toContain("First rendered chapter.");
      expect(container.querySelector("article.epub-reader-prose")).toBeTruthy();
    } finally {
      unmount();
    }
  });

  it("uses the paper reader theme by default and keeps readable article variables", async () => {
    const { container, unmount } = await mount(<EpubReader />);
    try {
      await openBook(container);

      const shell = container.querySelector(".epub-reader-shell") as HTMLElement;
      const article = container.querySelector("article.epub-reader-prose") as HTMLElement;
      expect(shell.dataset.readerTheme).toBe("paper");
      expect(article.className).toContain("epub-reader-prose");
      expect(shell.style.getPropertyValue("--epub-font-size")).toBe("18px");
      expect(shell.style.getPropertyValue("--epub-line-height")).toBe("1.65");
    } finally {
      unmount();
    }
  });

  it("changes and persists reading preferences through CSS variables", async () => {
    const { container, unmount } = await mount(<EpubReader />);
    try {
      await openBook(container);
      await act(async () => {
        [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Aa")!.click();
      });
      await act(async () => {
        (container.querySelector('button[aria-label="Increase font size"]') as HTMLButtonElement).click();
      });
      await act(async () => {
        [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Night")!.click();
      });

      const shell = container.querySelector(".epub-reader-shell") as HTMLElement;
      expect(shell.dataset.readerTheme).toBe("night");
      expect(shell.style.getPropertyValue("--epub-font-size")).toBe("19px");
      expect(storageJson()).toMatchObject({ prefs: { theme: "night", fontSize: 19 } });
    } finally {
      unmount();
    }
  });

  it("changes chapters from the TOC and stores progress metadata only", async () => {
    const fileSource = source(bookBytes(), "remember.epub");
    const identity = `epub:${fileSource.file.name}:${fileSource.file.size}:${fileSource.file.lastModified}`;
    const { container, unmount } = await mount(<EpubReader />);
    try {
      await openBook(container, fileSource);

      const securityButton = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("Security chapter") && button.textContent?.includes("2"),
      );
      expect(securityButton).toBeTruthy();
      await act(async () => {
        securityButton!.click();
      });

      expect(container.textContent).toContain("Second rendered chapter with security marker.");
      expect(storageJson()).toMatchObject({
        books: {
          [identity]: {
            progress: { chapterHref: "OPS/two.xhtml", chapterProgress: 0 },
            bookmarks: [],
          },
        },
      });
      expect(localStorage.getItem(EPUB_READER_STORAGE_KEY)).not.toContain("Second rendered chapter");
    } finally {
      unmount();
    }
  });

  it("searches, jumps to a result, and marks the sanitized chapter text", async () => {
    const { container, unmount } = await mount(<EpubReader />);
    try {
      await openBook(container);
      await act(async () => {
        [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Search"))!.click();
      });
      const input = container.querySelector('input[type="search"]') as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, "security");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      await waitFor(() => expect(container.textContent).toContain("Second rendered chapter with security marker"));
      const result = [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Security chapter") && button.textContent?.includes("security marker"),
      );
      expect(result).toBeTruthy();
      await act(async () => {
        result!.click();
      });

      await waitFor(() => {
        expect(container.textContent).toContain("Second rendered chapter with security marker.");
        expect(container.querySelector("mark.epub-reader-search-hit")?.textContent?.toLowerCase()).toBe("security");
      });
    } finally {
      unmount();
    }
  });

  it("adds and removes a bookmark while storing only bookmark metadata", async () => {
    const { container, unmount } = await mount(<EpubReader />);
    try {
      await openBook(container);
      await act(async () => {
        [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Bookmark")!.click();
      });

      await waitFor(() => expect(container.textContent).toContain("Start here · 0%"));
      expect(localStorage.getItem(EPUB_READER_STORAGE_KEY)).toContain("Start here · 0%");
      expect(localStorage.getItem(EPUB_READER_STORAGE_KEY)).not.toContain("First rendered chapter");

      const deleteButton = container.querySelector('button[aria-label^="Delete bookmark"]') as HTMLButtonElement;
      await act(async () => {
        deleteButton.click();
      });

      await waitFor(() => expect(container.textContent).toContain("No bookmarks yet."));
    } finally {
      unmount();
    }
  });

  it("advances chapters with the bracket keyboard shortcut outside inputs", async () => {
    const { container, unmount } = await mount(<EpubReader />);
    try {
      await openBook(container);
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "]", bubbles: true }));
      });

      await waitFor(() => expect(container.textContent).toContain("Second rendered chapter with security marker."));
    } finally {
      unmount();
    }
  });

  it("sanitizes rendered chapter markup and strips non-data image sources", async () => {
    const { container, unmount } = await mount(<EpubReader />);
    try {
      await openBook(container);
      const securityButton = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("Security chapter") && button.textContent?.includes("2"),
      );
      await act(async () => {
        securityButton!.click();
      });

      const article = container.querySelector("article.epub-reader-prose")!;
      expect(article.querySelector("script")).toBeNull();
      expect((window as { __epubXss?: unknown }).__epubXss).toBeUndefined();
      for (const img of Array.from(article.querySelectorAll("img[src]"))) {
        expect(img.getAttribute("src") ?? "").toMatch(/^data:image\//);
      }
    } finally {
      unmount();
    }
  });
});
