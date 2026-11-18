import * as React from "react";

/** Whether the page is in dark mode: the `data-theme` stamp wins, then the system preference. Follows changes. */
function readDark(): boolean {
  if (typeof document === "undefined") return false;
  const stamped = document.documentElement.getAttribute("data-theme");
  if (stamped === "dark") return true;
  if (stamped === "light") return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useDark(): boolean {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const update = () => setDark(readDark());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    query?.addEventListener?.("change", update);
    return () => {
      observer.disconnect();
      query?.removeEventListener?.("change", update);
    };
  }, []);
  return dark;
}
