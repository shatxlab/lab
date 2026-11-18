import * as React from "react";

import { highlightCodeBlocks } from "@/lib/viewer/highlight";

type RichViewProps = {
  /** Sanitized HTML for the preview. */
  html: string;
};

/**
 * The rendered preview for Markdown and HTML. The preview is always sanitized
 * HTML; the source is edited in Open's Edit mode, so there is no second
 * Preview/Source switch here.
 */
export function MarkdownView({ html }: RichViewProps) {
  const articleRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    void highlightCodeBlocks(article).catch(() => {
      // Highlighting is cosmetic; a failed chunk load still leaves readable code.
    });
  }, [html]);

  return (
    <div className="min-h-0 flex-1 overflow-auto" data-print-flow="">
      <article
        ref={articleRef}
        className="doc-prose mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
