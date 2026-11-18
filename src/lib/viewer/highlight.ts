/**
 * Walks already-sanitized Markdown HTML and colourises fenced blocks. Loaded
 * only after a Markdown file with a language class is on screen, so opening a
 * plain README does not download highlight.js.
 */
export async function highlightCodeBlocks(root: ParentNode): Promise<void> {
  const blocks = [...root.querySelectorAll("pre code[class*='language-']")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement && node.dataset.highlighted !== "yes",
  );
  if (blocks.length === 0) return;

  const { default: hljs } = await import("@/lib/viewer/highlight-engine");

  for (const block of blocks) {
    const language = [...block.classList]
      .find((name) => name.startsWith("language-"))
      ?.slice("language-".length);
    if (!language || !hljs.getLanguage(language)) continue;
    hljs.highlightElement(block);
  }
}
