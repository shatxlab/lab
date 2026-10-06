import type { APIRoute } from "astro";

import { TOOLS } from "@/lib/apps/tools";
import { withBase } from "@/lib/apps/paths";

/** One URL per page, with the trailing slash the static host redirects to. */
export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://example.com");
  const paths = ["/", ...TOOLS.map((tool) => `${tool.path}/`)];
  const slash = (path: string) => (path.endsWith("/") ? path : `${path}/`);
  const urls = paths.map((path) => `  <url><loc>${new URL(slash(withBase(path)), origin).href}</loc></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
