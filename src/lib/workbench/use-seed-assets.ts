import * as React from "react";

import type { Asset } from "./asset";

/**
 * Seed an operation's draft from its assets. Runs only when the selection
 * (by id) changes, so editing after a drop is never clobbered by a re-render.
 *
 * The seed callback receives an `isCancelled` check: it returns `true` once the
 * selection changes or the component unmounts, so an async seed can avoid a
 * late `setState` after its `await`s. Callers that ignore the second argument
 * keep the original behaviour (and still get the safe `.catch`).
 */
export function useSeedAssets(
  assets: readonly Asset[],
  seed: (assets: readonly Asset[], isCancelled: () => boolean) => Promise<void>,
): void {
  const key = assets.map((asset) => asset.id).join("|");
  const latest = React.useRef({ assets, seed });
  latest.current = { assets, seed };
  React.useEffect(() => {
    if (latest.current.assets.length === 0) return;
    let cancelled = false;
    void latest.current
      .seed(latest.current.assets, () => cancelled)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
}
