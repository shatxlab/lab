/**
 * Open the browser's print dialog for the current document. Browsers use
 * `document.title` as the suggested PDF file name, so it is swapped for the
 * file's name while printing and restored afterwards. The layout itself is
 * handled by the `@media print` rules in tools.css.
 */
export function printDocument(title: string): void {
  const previous = document.title;
  document.title = title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}
