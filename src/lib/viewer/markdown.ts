import { Marked } from "marked";

import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";

/**
 * GFM is on so the tables, task lists and strikethrough that people actually
 * write in README files render rather than as literal pipes and dashes.
 */
function createRenderer() {
  return new Marked({ gfm: true, breaks: false });
}

/** Raw marked output, before sanitizing. Exported so it can be tested without a DOM. */
export function markdownToHtml(markdown: string): string {
  return createRenderer().parse(markdown, { async: false }) as string;
}

export function renderMarkdown(markdown: string): string {
  return sanitizeDocumentHtml(markdownToHtml(markdown));
}
