import * as React from "react";

import { highlightCodeBlocks } from "@/lib/viewer/highlight";

export function MarkdownView({ html }: { html: string }) {
  const articleRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    void highlightCodeBlocks(article).catch(() => {
      // Highlighting is cosmetic; a failed chunk load still leaves readable code.
    });
  }, [html]);

  return (
    <div className="h-full overflow-auto">
      <article
        ref={articleRef}
        className="doc-prose mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
