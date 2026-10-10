import * as React from "react";

import hljs from "@/lib/viewer/highlight-engine";

/** Languages a {@link SourceEditor} can colourise. `"text"` stays plain. */
export type SourceEditorLanguage = "text" | "markdown" | "html" | "json" | "yaml" | "toml";

export interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: SourceEditorLanguage;
  ariaLabel?: string;
  id?: string;
}

/**
 * highlight.js ships every language under its own id; HTML is XML and there is
 * no TOML grammar registered, so it borrows the INI one. `"text"` never calls
 * into highlight.js.
 */
const HLJS_LANGUAGE: Record<Exclude<SourceEditorLanguage, "text">, string> = {
  markdown: "markdown",
  html: "xml",
  json: "json",
  yaml: "yaml",
  toml: "ini",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The highlighted inner HTML for the mirroring `<code>` element. */
function highlightSource(value: string, language: SourceEditorLanguage): string {
  const highlighted =
    language === "text"
      ? escapeHtml(value)
      : hljs.highlight(value, { language: HLJS_LANGUAGE[language], ignoreIllegals: true }).value;
  // A trailing newline collapses away inside `<pre>`, so the last empty line
  // would have no box and the caret could drift below the highlight. A
  // zero-width space keeps the two in lockstep without adding any width.
  return value.endsWith("\n") ? `${highlighted}\u200B` : highlighted;
}

/**
 * Controlled, syntax-highlighted plain-text editor.
 *
 * The coloured `<pre><code>` lives in normal flow and defines the box; a
 * transparent `<textarea>` sits exactly over it with the same font, size,
 * leading and padding, so typing edits the text in place under live syntax
 * colours with no visible input chrome. The highlighted markup trails the
 * value through `useDeferredValue`, so keystrokes are never blocked by a
 * highlight re-render. The editor grows with its content (its parent owns any
 * scrolling), matching `JsonView`. SSR-safe: nothing touches the DOM at module
 * scope.
 */
export function SourceEditor({
  value,
  onChange,
  language = "text",
  ariaLabel,
  id,
}: SourceEditorProps): React.JSX.Element {
  const deferredValue = React.useDeferredValue(value);
  const markup = React.useMemo(() => highlightSource(deferredValue, language), [deferredValue, language]);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  return (
    // `w-max` lets long unwrapped lines widen the mirror (the parent scrolls);
    // `min-w-full` keeps it filling a wide pane. The border lives on the root
    // so the overlay never paints over it.
    <div
      data-source-editor=""
      className="relative w-max min-w-full rounded-md border border-(--border) bg-(--bg)"
    >
      {/* Token colours come from the shared global stylesheet's `.doc-prose`
          scope; the utilities reset its block spacing so the mirror aligns. */}
      <div className="doc-prose" aria-hidden="true">
        <pre className="m-0 min-h-40 overflow-visible rounded-none border-0 bg-transparent px-3 py-2 font-mono text-[0.9375rem] leading-relaxed whitespace-pre">
          <code
            className="hljs block bg-transparent p-0 font-mono text-[0.9375rem] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        </pre>
      </div>
      <textarea
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        spellCheck={false}
        className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent px-3 py-2 font-mono text-[0.9375rem] leading-relaxed text-transparent caret-(--fg) outline-none selection:bg-(--accent) selection:text-(--accent-fg)"
      />
    </div>
  );
}
