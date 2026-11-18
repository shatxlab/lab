import * as React from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";

import type { AppLang } from "@/lib/apps/lang";
import { notesPlural, t } from "@/lib/viewer/i18n";
import { cn } from "@/lib/viewer/utils";

type DocxViewProps = {
  lang: AppLang;
  html: string;
  warnings: string[];
};

export function DocxView({ lang, html, warnings }: DocxViewProps) {
  const [showWarnings, setShowWarnings] = React.useState(false);

  return (
    <div className="h-full overflow-auto px-4 py-8 sm:px-6 sm:py-10" data-print-flow="">
      <div className="mx-auto w-full max-w-2xl">
        {warnings.length > 0 && (
          <div data-no-print="" className="mb-6 rounded-lg border border-(--border) bg-(--surface)/60 text-sm">
            <button
              type="button"
              onClick={() => setShowWarnings((open) => !open)}
              className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-(--muted-fg) transition-colors hover:text-(--fg)"
              aria-expanded={showWarnings}
            >
              <TriangleAlert className="size-4 shrink-0" />
              <span className="flex-1">
                {t(lang, "formattingNotes", {
                count: warnings.length,
                notesPlural: notesPlural(warnings.length),
              })}
              </span>
              <ChevronDown
                className={cn("size-4 transition-transform", showWarnings && "rotate-180")}
              />
            </button>

            {showWarnings && (
              <ul className="space-y-1.5 border-t border-(--border) px-4 py-3 text-xs text-(--muted-fg)">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <article className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
