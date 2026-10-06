import * as React from "react";

import type { AppLang } from "@/lib/apps/lang";
import { t } from "@/lib/viewer/i18n";
import { parseJson, prettifyJson, tokenizePrettyLine, type JsonToken } from "@/lib/viewer/json";

export type JsonViewProps = {
  lang: AppLang;
  value: unknown;
  onApply?: (value: unknown) => void;
  /**
   * Changes ONLY when the document is replaced from outside — a new file is
   * opened or edits are discarded. Applying an edit must not change it, or the
   * draft would be reformatted mid-typing.
   */
  resetKey?: string;
  /** Drops applied edits and returns to the opened document (Escape). */
  onRevert?: () => void;
};

/*
 * The viewer IS the editor: a transparent-text textarea sits on top of the
 * highlighted code and mirrors it exactly (same font, size, leading, padding,
 * wrapping), so typing edits the pretty-printed document in place with live
 * syntax colors and no visible input chrome.
 */
export function JsonView({ lang, value, onApply, resetKey, onRevert }: JsonViewProps) {
  const [draft, setDraft] = React.useState(() => prettifyJson(value));
  const [error, setError] = React.useState<string | null>(null);
  // The highlight mirrors the draft text itself, not the parsed value: while
  // the draft is invalid there is no value to prettify, and mirroring the text
  // keeps every glyph aligned under the caret.
  const lines = React.useMemo(() => draft.split("\n").map((line) => tokenizePrettyLine(line)), [draft]);
  /** Latest prop value for handlers, without re-subscribing effects. */
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // The document was replaced from outside (opened, discarded): show it.
  React.useEffect(() => {
    setDraft(prettifyJson(valueRef.current));
    setError(null);
  }, [resetKey]);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = event.target.value;
      setDraft(text);
      if (!onApply) return;
      try {
        const { value: parsed } = parseJson(text);
        setError(null);
        onApply(parsed);
      } catch (parseError) {
        // The draft stays visible in the editor; the last valid document
        // remains the saved one until the draft parses again.
        setError(parseError instanceof Error ? parseError.message : t(lang, "invalidJson"));
      }
    },
    [onApply],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Typing here is not a shortcut for the app: no key reaches the global
      // handlers while the JSON document has focus.
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        // Escape reverts the draft to the saved document, dropping any edits
        // this typing session applied. onRevert also clears the parent's edit
        // state; the local resync covers standalone use without a parent.
        onRevert?.();
        setDraft(prettifyJson(valueRef.current));
        setError(null);
      }
    },
    [onRevert],
  );

  return (
    <div className="json-view h-full overflow-auto">
      {/*
       * The highlight lives in normal flow and defines the box; the textarea
       * stretches exactly over it, so the two can never drift apart — the
       * outer pane scrolls both together. The column is at least 48rem
       * (capped by the pane) and grows with the longest line, so the
       * wrap-disabled textarea never scrolls internally and stays aligned.
       */}
      <div className="relative mx-auto w-max min-w-[min(48rem,100%)] px-4 py-8 sm:px-6 sm:py-10">
        <div className="whitespace-pre font-mono text-[0.9375rem] leading-relaxed" data-json-code="">
          {lines.map((tokens, index) => (
            <div className="json-line" key={index}>
              {tokens.length === 0
                ? // An empty line (including a trailing newline) still needs
                  // its line box, or the mirror shifts out of alignment.
                  "\u200B"
                : tokens.map((token, tokenIndex) => {
                    const className = tokenClass(token);
                    return className ? (
                      <span key={tokenIndex} className={className}>
                        {token.text}
                      </span>
                    ) : (
                      <React.Fragment key={tokenIndex}>{token.text}</React.Fragment>
                    );
                  })}
            </div>
          ))}
        </div>
        <textarea
          aria-label={t(lang, "jsonDocument")}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          readOnly={!onApply}
          spellCheck={false}
          className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent px-4 py-8 font-mono text-[0.9375rem] leading-relaxed text-transparent caret-(--fg) outline-none selection:bg-(--accent) selection:text-(--accent-fg) sm:px-6 sm:py-10"
        />
      </div>
      {error && (
        <p role="alert" className="sticky bottom-0 m-0 bg-(--bg) px-4 py-2 text-sm text-(--warning) sm:px-6">
          {error}
        </p>
      )}
    </div>
  );
}

function tokenClass(token: JsonToken): string {
  switch (token.type) {
    case "key":
      return "hljs-attr";
    case "value":
      return token.kind === "string" ? "hljs-string" : token.kind === "number" ? "hljs-number" : "hljs-literal";
    default:
      return "";
  }
}
