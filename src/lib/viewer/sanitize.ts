import DOMPurify from "dompurify";

let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  // Documents routinely link outward; opening those in the current tab would
  // throw away the file the reader just loaded, since nothing is persisted.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "IMG" && node.hasAttribute("src")) {
      const src = node.getAttribute("src") ?? "";
      if (!/^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon);base64,[a-z0-9+/]+={0,2}$/i.test(src)) {
        node.removeAttribute("src");
      }
    }
    if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * The single trust boundary in the app. Both marked and mammoth emit HTML built
 * from file contents we never control, and a `.docx` can carry arbitrary
 * embedded markup, so nothing reaches `dangerouslySetInnerHTML` unsanitized.
 *
 * Only base64 raster `data:` images survive; documents cannot automatically
 * fetch resources. Normal hyperlinks remain usable on explicit user action.
 */
export function sanitizeDocumentHtml(html: string): string {
  installHooks();

  // Parse in a template's inert owner document, not a live detached element or
  // DOMParser document: those can start image/frame requests before sanitizing.
  // In-place sanitization keeps untrusted nodes in that inert document.
  const template = document.createElement("template");
  const container = template.content.ownerDocument.createElement("div");
  template.content.append(container);
  container.innerHTML = html;
  DOMPurify.sanitize(container, {
    IN_PLACE: true,
    // Only passive HTML formatting is supported. New resource-bearing tags or
    // attributes must not become allowed when DOMPurify expands its defaults.
    ALLOWED_TAGS: [
      "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "blockquote",
      "br", "caption", "cite", "code", "col", "colgroup", "dd", "del", "dfn",
      "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2",
      "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "ins", "kbd", "li",
      "main", "mark", "nav", "ol", "p", "pre", "q", "s", "samp", "section",
      "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot",
      "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
    ],
    ALLOWED_ATTR: [
      "abbr", "align", "alt", "class", "colspan", "datetime", "dir", "headers",
      "height", "href", "id", "lang", "name", "rel", "reversed", "rowspan",
      "scope", "span", "src", "start", "target", "title", "valign", "value", "width",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  return container.innerHTML;
}
