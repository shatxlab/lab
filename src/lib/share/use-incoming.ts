import * as React from "react";

import { decodeShare, type IncomingShare } from "./codec";
import { clearSendFragment } from "@/lib/send/use-incoming";

export interface IncomingShareState {
  /** A `#share=…` fragment is waiting for its passphrase. */
  prompt: boolean;
  /** The last attempt with this fragment failed its tag check. */
  wrong: boolean;
  /** A decrypted document of this tool's kind, pending import. */
  incoming: IncomingShare | null;
  submit: (passphrase: string) => void;
  dismiss: () => void;
}

/**
 * Picks up a document shared by link (`#share=…`). Nothing of the payload is
 * known until the passphrase decrypts it; a successful decode of a kind this
 * tool does not take is dropped here along with the fragment. The data stays
 * pending until the caller `dismiss`es it (import or cancel).
 */
export function useIncomingShare(kinds: readonly string[]): IncomingShareState {
  const [fragment, setFragment] = React.useState<string | null>(null);
  const [incoming, setIncoming] = React.useState<IncomingShare | null>(null);
  const [wrong, setWrong] = React.useState(false);
  // Bumped on dismiss and on every new fragment: a decode still in flight
  // (the KDF takes a beat) must never apply a stale result.
  const attempt = React.useRef(0);

  React.useEffect(() => {
    const read = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#share=")) {
        attempt.current += 1;
        setFragment(hash.slice(1));
        setWrong(false);
      } else {
        setFragment(null);
        setWrong(false);
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const submit = React.useCallback(
    (passphrase: string) => {
      const current = fragment;
      if (!current) return;
      const id = ++attempt.current;
      void decodeShare(current, passphrase).then((decoded) => {
        // A wrong passphrase re-renders this very prompt with the error; a
        // dismissed or replaced prompt (stale attempt) does nothing.
        if (attempt.current !== id) return;
        if (!decoded || !kinds.includes(decoded.kind)) {
          if (decoded) {
            // Another tool's document: not ours to hold. Drop it and the fragment.
            setFragment(null);
            setWrong(false);
            clearSendFragment();
          } else {
            setWrong(true);
          }
          return;
        }
        setFragment(null);
        setWrong(false);
        setIncoming(decoded);
      });
    },
    [fragment, kinds],
  );

  const dismiss = React.useCallback(() => {
    attempt.current += 1;
    setFragment(null);
    setIncoming(null);
    setWrong(false);
    clearSendFragment();
  }, []);

  return { prompt: fragment !== null, wrong, incoming, submit, dismiss };
}
