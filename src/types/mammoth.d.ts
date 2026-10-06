/**
 * Mammoth ships no type declarations, so the small surface this app uses is
 * described here.
 *
 * The import targets the prebuilt browser bundle rather than the package root
 * on purpose. `mammoth`'s root entry is the Node build, whose unzip only takes
 * a file path or a Buffer; only the browser build accepts the `ArrayBuffer` a
 * `File` gives us. The package declares that swap in its `browser` field, but
 * relying on a bundler to apply it means the viewer breaks on a resolver change
 * with nothing to catch it, and test runners resolve it the Node way.
 */
declare module "mammoth/mammoth.browser.min.js" {
  export type MammothMessage = {
    type: "warning" | "error" | string;
    message: string;
  };

  export type MammothResult = {
    value: string;
    messages: MammothMessage[];
  };

  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: { styleMap?: string | string[] },
  ): Promise<MammothResult>;
}
