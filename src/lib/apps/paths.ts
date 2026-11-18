/*
 * Astro exposes the configured `base` as `import.meta.env.BASE_URL` without a
 * trailing slash (e.g. `/lab`, or `/` at a root deployment). This normalizes
 * it so root-relative links stay correct whether the app is served at the
 * domain root or under the GitHub Pages project subpath.
 */
const raw = import.meta.env.BASE_URL;
export const basePath = raw === "/" ? "" : raw.replace(/\/+$/, "");

/** Prefix a root-relative path with the deployment base. */
export function withBase(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (clean === "/") return basePath || "/";
  return `${basePath}${clean}`;
}
