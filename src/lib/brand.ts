/**
 * The product's identity in one place: the name, the line that sells it and the
 * site-wide description. The layout, manifest, sitemap, header and landing page
 * all read from here, so a rename touches this file (plus assets/favicon.svg and
 * `npm`-less `scripts/generate-brand-assets.mjs` for the images).
 */
export const BRAND = {
  name: "Local Lab",
  /** The promise, short enough for a hero line and a social card. */
  tagline: {
    en: "Your tools. Your browser. Your data stays yours.",
    ru: "Ваши инструменты. Ваш браузер. Данные остаются у вас.",
  },
  /** One-paragraph pitch for the landing page. */
  pitch: {
    en: "A free toolbox for documents, PDFs, images, QR codes, text and data — plus a few games. Everything runs on your device, works offline and needs no account.",
    ru: "Бесплатный набор инструментов для документов, PDF, картинок, QR-кодов, текста и данных — и несколько игр. Всё работает на вашем устройстве, без интернета и без регистрации.",
  },
  /** Facts shown as badges under the pitch. */
  promises: {
    en: ["Runs on your device", "Works offline", "Free, no account", "English & Русский"],
    ru: ["Работает на вашем устройстве", "Работает без интернета", "Бесплатно, без регистрации", "English и Русский"],
  },
  /** `<meta name="description">` for the home page. */
  description:
    "Local Lab is a free toolbox that runs entirely in your browser: view and convert documents, merge and split PDFs, compress images, make QR codes, diff text, convert data — and play Wordle. Your data stays on your device.",
  /** Home-page `<title>`. */
  homeTitle: "Local Lab — free browser tools that run on your device",
  themeColor: { light: "#fafafa", dark: "#242424" },
  /** Colours used by the installed app's splash screen and toolbar. */
  manifest: { background: "#242424", theme: "#047857" },
} as const;

/** `<title>` for a tool page: its search-friendly headline plus the brand. */
export function pageTitle(headline: string): string {
  return `${headline} | ${BRAND.name}`;
}
