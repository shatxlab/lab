// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { JsonView } from "@/components/viewer/viewers/JsonView";
import { parseJson } from "@/lib/viewer/json";

/*
 * The view IS the editor: the highlighted code is always editable in place —
 * no edit button, no bordered input. A valid draft applies live; an invalid
 * one stays in the editor with the parse error; Escape reverts to the saved
 * document.
 */

async function typeIntoTextarea(textarea: HTMLTextAreaElement, text: string) {
  await act(async () => {
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    native?.set?.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("JsonView", () => {
  it("pretty-prints a minified document into one always-editable surface", () => {
    const { value } = parseJson('{"name":"Ada","count":2}');
    const markup = renderToStaticMarkup(<JsonView lang="en" value={value} resetKey="f" onApply={vi.fn()} />);

    // The editable surface is there from the start: no edit button exists.
    expect(markup).toContain('aria-label="JSON document"');
    expect(markup).not.toContain(">Edit JSON<");
    expect(markup).not.toContain(">Apply changes<");
    expect(markup).not.toContain(">Cancel<");
    expect(markup).toContain("data-json-code");
    // Key and value are colored spans separated by plain punctuation.
    expect(markup).toContain('<span class="hljs-attr">&quot;name&quot;</span>: <span class="hljs-string">&quot;Ada&quot;</span>');
    // Two levels of indent prove this is stringify(value, null, 2) output.
    expect(markup).toContain('<div class="json-line">  <span class="hljs-attr"');
    // Token classes: keys and values are colored, punctuation is plain.
    expect(markup).toContain('class="hljs-attr"');
    expect(markup).toContain('class="hljs-number"');
  });

  it("applies a valid draft live while the highlight mirrors the text", async () => {
    const onApply = vi.fn();
    const { value } = parseJson('{"city":"Berlin"}');
    const { container, unmount } = await mount(
      <JsonView lang="en" value={value} resetKey="f" onApply={onApply} />,
    );

    try {
      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      expect(editor.value).toBe('{\n  "city": "Berlin"\n}');

      await typeIntoTextarea(editor, '{\n  "city": "Tokyo",\n  "active": true\n}');

      expect(onApply).toHaveBeenCalledWith({ city: "Tokyo", active: true });
      expect(container.querySelector('[role="alert"]')).toBeNull();
      // The surface never switches modes: editor and highlight stay together.
      expect(container.querySelector('textarea[aria-label="JSON document"]')).toBeTruthy();
      expect(container.querySelector("[data-json-code]")!.textContent).toContain('"city": "Tokyo"');
    } finally {
      unmount();
    }
  });

  it("keeps invalid JSON in the editor, shows the parse error, and does not apply", async () => {
    const onApply = vi.fn();
    const { value } = parseJson('{"city":"Berlin"}');
    const { container, unmount } = await mount(
      <JsonView lang="en" value={value} resetKey="f" onApply={onApply} />,
    );

    try {
      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      const invalid = '{\n  "city":\n}';
      await typeIntoTextarea(editor, invalid);

      expect(onApply).not.toHaveBeenCalled();
      expect(editor.value).toBe(invalid);
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invalid JSON");
      // The highlight still mirrors the invalid draft text.
      expect(container.querySelector("[data-json-code]")!.textContent).toContain('"city":');

      // Fixing the draft clears the error and applies.
      await typeIntoTextarea(editor, '{"city": "Berlin"}');
      expect(onApply).toHaveBeenCalledWith({ city: "Berlin" });
      expect(container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      unmount();
    }
  });

  it("reverts the draft with Escape, without leaking the key to shortcuts", async () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    const { value } = parseJson('{"city":"Berlin"}');
    const { container, unmount } = await mount(
      <JsonView lang="en" value={value} resetKey="f" onApply={onApply} onRevert={onRevert} />,
    );

    const leaked: KeyboardEvent[] = [];
    const windowListener = (event: KeyboardEvent) => leaked.push(event);
    window.addEventListener("keydown", windowListener);

    try {
      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      await typeIntoTextarea(editor, '{"city":"Tokyo"}');
      expect(onApply).toHaveBeenCalledWith({ city: "Tokyo" });

      await act(async () => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });

      expect(onRevert).toHaveBeenCalled();
      expect(editor.value).toBe('{\n  "city": "Berlin"\n}');
      expect(leaked).toHaveLength(0);
    } finally {
      window.removeEventListener("keydown", windowListener);
      unmount();
    }
  });

  it("resyncs the draft when the document is replaced from outside", async () => {
    const onApply = vi.fn();
    const berlin = parseJson('{"city":"Berlin"}').value;
    const { container, rerender, unmount } = await mount(
      <JsonView lang="en" value={berlin} resetKey="f" onApply={onApply} />,
    );

    try {
      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      await typeIntoTextarea(editor, '{"city":"Tokyo"}');

      // Discard / new file: a new resetKey shows the new document…
      const paris = parseJson('{"city":"Paris"}').value;
      await rerender(<JsonView lang="en" value={paris} resetKey="g" onApply={onApply} />);
      expect(editor.value).toBe('{\n  "city": "Paris"\n}');

      // …but applying an edit alone must not reformat the draft mid-typing.
      const tokyo = parseJson('{"city":"Tokyo"}').value;
      await typeIntoTextarea(editor, '{"city":"Kyoto"}');
      await rerender(<JsonView lang="en" value={tokyo} resetKey="g" onApply={onApply} />);
      expect(editor.value).toBe('{"city":"Kyoto"}');
    } finally {
      unmount();
    }
  });

  it("renders an XSS payload inside a string as inert text", () => {
    const { value } = parseJson('{"note":"<img src=x onerror=\\"window.__x=1\\">"}');
    const markup = renderToStaticMarkup(<JsonView lang="en" value={value} resetKey="f" onApply={vi.fn()} />);

    // The payload is present as text (escaped), and no element materializes.
    expect(markup).toContain("&lt;img src=x onerror=");
    expect(markup).not.toContain("<img ");
    expect(markup).not.toContain("<script");
  });

  it("keeps XSS payloads inert under the live DOM too", async () => {
    const { value } = parseJson('{"note":"<img src=x onerror=\\"window.__x=1\\"><script>window.__y=1</script>"}');
    const { container, unmount } = await mount(
      <JsonView lang="en" value={value} resetKey="f" onApply={vi.fn()} />,
    );

    try {
      expect(container.querySelectorAll("img, script, iframe")).toHaveLength(0);
      expect(container.textContent).toContain("<img src=x onerror=");
      expect(container.textContent).toContain("<script>window.__y=1</script>");

      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      expect(editor.value).toContain("<img src=x onerror=");
      expect(editor.value).toContain("<script>window.__y=1</script>");
      expect(container.querySelectorAll("img, script, iframe")).toHaveLength(0);
    } finally {
      unmount();
    }
  });

  it("uses contrast-verified theme tokens for JSON syntax", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/viewer.css"), "utf8");

    // Keys are the theme accent; string values are a distinct blue so a key
    // can never be mistaken for its value.
    expect(css).toMatch(
      /\.json-view \.hljs-attr\s*{\s*@apply text-\(--accent\);/,
    );
    expect(css).toMatch(
      /\.json-view \.hljs-string\s*{\s*color: oklch\(0\.52 0\.12 250\);/,
    );
    expect(css).toMatch(
      /\[data-theme="dark"\] \.json-view \.hljs-string\s*{\s*color: oklch\(0\.82 0\.11 245\);/,
    );
    expect(css).toMatch(
      /\.json-view \.hljs-number,\s*\.json-view \.hljs-literal\s*{\s*@apply text-\(--warning\);/,
    );
  });
});

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
    async rerender(next: ReactElement) {
      await act(async () => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
