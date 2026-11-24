import * as React from "react";

import { Modal } from "@/components/apps/Modal";
import { ActionButton, CopyButton } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { sh } from "@/lib/share/i18n";
import { generatePassphrase, MAX_SHARE_FRAGMENT_CHARS, shareLink, type EncodeShareResult } from "@/lib/share/codec";

export interface ShareByLinkProps {
  lang: AppLang;
  /** The tool's page path, with the site base (e.g. `withBase("/tools")`). */
  toolPath: string;
  /**
   * Encrypts the document for one dialog opening. Reading the data (which can
   * be large or lazy) and choosing the payload shape stay with the caller.
   */
  build: (passphrase: string) => Promise<EncodeShareResult>;
  disabled?: boolean;
  className?: string;
  /** Replaces the default button; call `open` to show the dialog. */
  trigger?: (open: () => void) => React.ReactNode;
}

type Built = { ok: true; link: string; size: number } | { ok: false; size: number } | { failed: true };

async function buildLink(toolPath: string, pass: string, build: (passphrase: string) => Promise<EncodeShareResult>): Promise<Built> {
  const encoded = await build(pass);
  if (!encoded.ok) return encoded.reason === "tooLarge" ? { ok: false, size: encoded.size } : { failed: true };
  const link = shareLink(window.location.origin, toolPath, encoded.fragment);
  return { ok: true, link, size: encoded.size };
}

/** A button that turns a document into an encrypted link plus a passphrase key. */
export function ShareByLink({ lang, toolPath, build, disabled, className, trigger }: ShareByLinkProps) {
  const [open, setOpen] = React.useState(false);
  const [built, setBuilt] = React.useState<Built | null>(null);
  const [passphrase, setPassphrase] = React.useState("");
  const [nonce, setNonce] = React.useState(0);
  // Read through a ref so a parent's inline callback does not re-run the encoding on every render.
  const buildRef = React.useRef(build);
  buildRef.current = build;

  React.useEffect(() => {
    if (!open) {
      setBuilt(null);
      setPassphrase("");
      return;
    }
    const pass = generatePassphrase();
    setPassphrase(pass);
    // No stale link beside a fresh passphrase while the rebuild runs.
    setBuilt(null);
    let cancelled = false;
    void buildLink(toolPath, pass, buildRef.current)
      .catch((): Built => ({ failed: true }))
      .then((result) => {
        if (!cancelled) setBuilt(result);
      });
    return () => {
      cancelled = true;
    };
  }, [open, toolPath, nonce]);

  const failed = built !== null && "failed" in built;
  const tooLarge = built !== null && "ok" in built && !built.ok ? built : null;

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <ActionButton variant="secondary" className={className} disabled={disabled} onClick={() => setOpen(true)}>
          {sh(lang, "button")}
        </ActionButton>
      )}
      <Modal open={open} onClose={() => setOpen(false)} label={sh(lang, "title")} className="lab-modal-md">
        <div className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{tooLarge ? sh(lang, "tooLargeTitle") : sh(lang, "title")}</h2>
          {built === null && !failed ? (
            <p className="text-sm text-(--muted-fg)">{sh(lang, "building")}</p>
          ) : built && "ok" in built && built.ok ? (
            <>
              <p className="text-sm">{sh(lang, "intro")}</p>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-(--muted-fg)">{sh(lang, "passphraseLabel")}</span>
                <code className="rounded-md border border-(--border) bg-(--bg) px-2 py-1 text-sm break-all">{passphrase}</code>
                <p className="text-xs text-(--muted-fg)">{sh(lang, "passphraseNote")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton lang={lang} text={built.link} label={sh(lang, "copyLink")} />
                <CopyButton lang={lang} text={passphrase} label={sh(lang, "copyPassphrase")} />
                <ActionButton
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  onClick={() => setNonce((current) => current + 1)}
                >
                  {sh(lang, "regenerate")}
                </ActionButton>
                <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => setOpen(false)}>
                  {sh(lang, "close")}
                </ActionButton>
              </div>
              <p className="text-xs text-(--muted-fg)">{sh(lang, "size", { n: built.size, max: MAX_SHARE_FRAGMENT_CHARS })}</p>
            </>
          ) : (
            (tooLarge || failed) && (
              <>
                <p className="text-sm">
                  {tooLarge ? sh(lang, "tooLarge", { n: tooLarge.size, max: MAX_SHARE_FRAGMENT_CHARS }) : sh(lang, "readFailed")}
                </p>
                <div>
                  <ActionButton onClick={() => setOpen(false)}>{sh(lang, "close")}</ActionButton>
                </div>
              </>
            )
          )}
        </div>
      </Modal>
    </>
  );
}
