import { useEffect, useState } from "react";

/**
 * Height obscured by the on-screen keyboard, in CSS pixels.
 *
 * Mobile browsers keep the layout viewport tall while shrinking the *visual*
 * viewport, so `100dvh`/`position: sticky; bottom: 0` end up behind the
 * keyboard. Reading `visualViewport` lets the clue bar sit just above it.
 * Returns 0 where the API (or a hardware keyboard) is unavailable.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const update = () => {
      const obscured = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(obscured > 80 ? Math.round(obscured) : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
