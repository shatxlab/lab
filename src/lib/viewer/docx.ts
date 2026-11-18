import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";
import { assertFileSizeWithinLimit, assertZipWithinLimits } from "@/lib/limits";

export type DocxDocument = {
  html: string;
  /** Mammoth's notes about styles it could not map; surfaced so a stripped heading is explainable. */
  warnings: string[];
};

/*
 * Word's built-in Title, Subtitle, Quote and so on have stable style IDs even
 * when the UI is in another language, so matching on `p.Title` covers a Russian
 * "Название" the same way it covers English "Title". Without these, mammoth
 * still emits the paragraph as HTML and then warns that the style was unknown.
 */
const WORD_STYLE_MAP = [
  "p.Title => h1.doc-title:fresh",
  "p[style-name='Title'] => h1.doc-title:fresh",
  "p.Subtitle => p.doc-subtitle:fresh",
  "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
  "p.Quote => blockquote:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p.IntenseQuote => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p.Caption => p.doc-caption:fresh",
  "p[style-name='Caption'] => p.doc-caption:fresh",
  "p.NoSpacing => p:fresh",
  "p[style-name='No Spacing'] => p:fresh",
  "p.BodyText => p:fresh",
  "p[style-name='Body Text'] => p:fresh",
  "p.BodyText2 => p:fresh",
  "p[style-name='Body Text 2'] => p:fresh",
  "p.BodyText3 => p:fresh",
  "p[style-name='Body Text 3'] => p:fresh",
];

export async function renderDocx(buffer: ArrayBuffer): Promise<DocxDocument> {
  const bytes = new Uint8Array(buffer);
  assertFileSizeWithinLimit(bytes.byteLength, "This Word document");
  assertZipWithinLimits(bytes, "This Word document");

  // Deferred so the ~500 KB of mammoth only downloads once a .docx is opened.
  // See src/types/mammoth.d.ts for why this points at the browser bundle.
  const { convertToHtml } = await import("mammoth/mammoth.browser.min.js");

  const result = await convertToHtml({ arrayBuffer: buffer }, { styleMap: WORD_STYLE_MAP });

  return {
    html: sanitizeDocumentHtml(result.value),
    warnings: [...new Set(result.messages.map((message) => message.message))],
  };
}
