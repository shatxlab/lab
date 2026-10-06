import type { APIRoute } from "astro";

import { TOOLS } from "@/lib/apps/tools";
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
    name: "lab — local-first browser tools",
    short_name: "lab",
    description: "Free tools that run entirely in your browser: documents, PDF, images, QR codes, text and data converters, and games. Nothing is uploaded.",
    lang: "en",
    start_url: scope,
    scope,
    display: "standalone",
    orientation: "any",
    background_color: "#242424",
    theme_color: "#242424",
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
