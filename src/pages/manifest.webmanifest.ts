import type { APIRoute } from "astro";

import { TOOLS } from "@/lib/apps/tools";
import { BRAND } from "@/lib/brand";
import { withBase } from "@/lib/apps/paths";

/** Tools offered as long-press shortcuts on the installed app icon. */
const SHORTCUTS = ["viewer", "pdf", "wordle", "qr"];

export const GET: APIRoute = () => {
  const scope = `${withBase("/")}${withBase("/").endsWith("/") ? "" : "/"}`;
  const icon = (file: string, sizes: string, purpose?: string) => ({
    src: withBase(`/icons/${file}`),
    sizes,
    type: "image/png",
    ...(purpose ? { purpose } : {}),
  });

  const manifest = {
    id: scope,
    name: `${BRAND.name} — free browser tools that never upload your files`,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: "en",
    start_url: scope,
    scope,
    display: "standalone",
    orientation: "any",
    background_color: BRAND.manifest.background,
    theme_color: BRAND.manifest.theme,
    categories: ["utilities", "productivity"],
    icons: [icon("icon-192.png", "192x192"), icon("icon-512.png", "512x512"), icon("icon-maskable-512.png", "512x512", "maskable")],
    shortcuts: SHORTCUTS.flatMap((id) => {
      const tool = TOOLS.find((entry) => entry.id === id);
      return tool
        ? [{ name: tool.title.en, short_name: tool.title.en, url: `${withBase(tool.path)}/`, icons: [icon("icon-192.png", "192x192")] }]
        : [];
    }),
  };

  return new Response(JSON.stringify(manifest, null, 2), { headers: { "Content-Type": "application/manifest+json" } });
};
