import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import pwa from "./scripts/pwa/integration.mjs";

/*
 * Every tool is client-side only (parsing/rendering happens in the tab, no
 * uploads), so the whole site is pre-rendered static output. No Node server,
 * no session storage, no runtime state — deployable to any static host/CDN.
 */
export default defineConfig({
  /*
   * GitHub Pages with the custom domain https://shatx.ru, served from the
   * root, so no `base`. Internal links use `import.meta.env.BASE_URL`, and
   * Astro prefixes the bundled `/_astro/*` asset URLs with `base` itself.
   */
  site: "https://shatx.ru",
  base: "/",
  output: "static",
  compressHTML: true,
  integrations: [react(), pwa()],
  /*
   * The app renders user Markdown in the browser (marked + highlight.js), so
   * Astro's build-time Markdown pipeline is unused. Shiki emits inline styles
   * that are incompatible with the CSP below; disabling it keeps the policy
   * strict and silences the config warning.
   */
  markdown: {
    syntaxHighlight: false,
  },
  /*
   * The app renders untrusted document HTML, so a strict CSP is the last line
   * of defence behind the DOMPurify boundary. Astro hashes its own inline
   * hydration scripts/styles; the directives below lock everything else down.
   * `frame-ancestors` is deliberately omitted: browsers ignore it in <meta>,
   * and assets/_headers sets X-Frame-Options: DENY instead.
   */
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        /*
         * The tycoon game's PixiJS renderer decodes textures in blob: workers
         * (pixi.js WorkerManager / ImageBitmap worker); without an explicit
         * worker-src they fall back to script-src (self) and are blocked.
         */
        "worker-src 'self' blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
      /*
       * Inline `style` attributes (React-rendered EPUB CSS variables,
       * sticky-header background) can't carry element hashes; allow them
       * while `<style>`/`<link>` stay locked to Astro's hashes + 'self'.
       */
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
    },
  },
  publicDir: "./assets",
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
