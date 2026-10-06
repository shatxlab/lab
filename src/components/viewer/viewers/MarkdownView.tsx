import * as React from "react";

import type { AppLang } from "@/lib/apps/lang";
import { Tabs } from "@/components/tools/ui";
import { highlightCodeBlocks } from "@/lib/viewer/highlight";
import { t } from "@/lib/viewer/i18n";

type Mode = "preview" | "source";

type RichViewProps = {
  lang: AppLang;
  /** Sanitized HTML for the preview. */
  html: string;
  /** The original text, shown on the Source tab. */
  source: string;
};

/**
 * Preview / Source view for rendered text formats (Markdown and HTML). The
 * preview is always sanitized HTML; printing the page prints whichever tab is
 * showing, so "Print / PDF" on the preview gives a clean document.
 */
export function MarkdownView({ lang, html, source }: RichViewProps) {
  const articleRef = React.useRef<HTMLElement>(null);
  const [mode, setMode] = React.useState<Mode>("preview");

  React.useEffect(() => {
    const article = articleRef.current;
    if (!article || mode !== "preview") return;
    void highlightCodeBlocks(article).catch(() => {
      // Highlighting is cosmetic; a failed chunk load still leaves readable code.
    });
  }, [html, mode]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-print-flow="">
      <div data-no-print="" className="border-b border-(--border) bg-(--bg) px-4 pt-1.5 sm:px-6">
        <Tabs
          idPrefix="rich-view"
          label={t(lang, "viewMode")}
          value={mode}
          onChange={setMode}
          tabs={[
            { id: "preview", label: t(lang, "preview") },
            { id: "source", label: t(lang, "source") },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto" data-print-flow="" role="tabpanel" id={`rich-view-panel-${mode}`} aria-labelledby={`rich-view-tab-${mode}`}>
        {mode === "preview" ? (
          <article
            ref={articleRef}
            className="doc-prose mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="mx-auto w-full max-w-3xl whitespace-pre-wrap break-words px-4 py-8 font-mono text-[0.9375rem] leading-relaxed sm:px-6 sm:py-10">
            {source}
          </pre>
        )}
      </div>
    </div>
  );
}
