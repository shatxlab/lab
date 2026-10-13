import * as React from "react";

/**
 * One side of a card. Markdown is rendered (and sanitized) by the shared
 * viewer renderer, loaded on first use; until then the plain text shows.
 */
export function CardText({ text, className }: { text: string; className?: string }) {
  const [html, setHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setHtml(null);
    void import("@/lib/viewer/markdown")
      .then((module) => {
        if (!cancelled) setHtml(module.renderMarkdown(text));
      })
      .catch(() => {
        // Plain text is a fine fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (html === null) return <div className={`whitespace-pre-wrap break-words ${className ?? ""}`}>{text}</div>;
  return <div className={`doc-prose break-words ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
