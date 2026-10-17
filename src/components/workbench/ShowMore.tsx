/**
 * The end of a long list: a button that reveals the next page, and also does so
 * by itself when it scrolls into view, so a thousand rows are never in the page
 * until they are asked for.
 */

import * as React from "react";

import { ActionButton } from "@/components/tools/ui";

export interface ShowMoreProps {
  label: string;
  onMore: () => void;
}

export function ShowMore({ label, onMore }: ShowMoreProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
    // Re-observing after every page makes a button that is still on screen ask again.
  }, [onMore, label]);
  return (
    <ActionButton ref={ref} variant="secondary" className="self-center" onClick={onMore}>
      {label}
    </ActionButton>
  );
}
