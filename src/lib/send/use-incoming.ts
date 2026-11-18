import * as React from "react";

import { decodeSend, type IncomingSend } from "@/lib/send/codec";

/** Remove the fragment from the address bar without adding a history entry. */
export function clearSendFragment(): void {
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    // The address bar is cosmetic; a failure only leaves the link visible.
  }
}

/**
 * Picks up data sent from another device (`#send=…`) once the page is ready.
 * Fragments for another tool are left alone; unreadable ones are cleared.
 * The data stays pending until the caller `dismiss`es it (import or cancel).
 */
export function useIncomingSend(kind: string): { incoming: IncomingSend | null; dismiss: () => void } {
  const [incoming, setIncoming] = React.useState<IncomingSend | null>(null);

  React.useEffect(() => {
    const read = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#send=")) return;
      const decoded = decodeSend(hash);
      if (!decoded) {
        clearSendFragment();
        return;
      }
      if (decoded.kind === kind) setIncoming(decoded);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [kind]);

  const dismiss = React.useCallback(() => {
    setIncoming(null);
    clearSendFragment();
  }, []);

  return { incoming, dismiss };
}
