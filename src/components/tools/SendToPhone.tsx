import * as React from "react";

import { Modal } from "@/components/apps/Modal";
import { ActionButton, CopyButton } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { MAX_FRAGMENT_CHARS, encodeSend, sendLink } from "@/lib/send/codec";
import { ts } from "@/lib/send/i18n";
import { DEFAULT_QR_STYLE, QrTooLongError, buildMatrix, matrixToSvg } from "@/lib/qr/generate";

export interface SendToPhoneProps {
  lang: AppLang;
  /** Names the data so the receiving tool knows what it got. */
  kind: string;
  /** The tool's page path, with the site base (e.g. `withBase("/flash")`). */
  toolPath: string;
  /** Called when the dialog opens, so big data is only read and encoded on demand. */
  getData: () => unknown | Promise<unknown>;
  disabled?: boolean;
  className?: string;
  /** Replaces the default button; call `open` to show the dialog. */
  trigger?: (open: () => void) => React.ReactNode;
}

type Built = { ok: true; link: string; size: number; svg: string } | { ok: false; size: number } | { failed: true };

function build(kind: string, toolPath: string, data: unknown): Built {
  const encoded = encodeSend(kind, data);
  if (!encoded.ok) return { ok: false, size: encoded.size };
  const link = sendLink(window.location.origin, toolPath, encoded.fragment);
  try {
    const style = { ...DEFAULT_QR_STYLE, errorCorrection: "M" as const };
    return { ok: true, link, size: encoded.size, svg: matrixToSvg(buildMatrix(link, "M"), style, 320) };
  } catch (error) {
    if (error instanceof QrTooLongError) return { ok: false, size: encoded.size };
    throw error;
  }
}

/** A button that shows the data as a QR code whose link a phone's camera app opens. */
export function SendToPhone({ lang, kind, toolPath, getData, disabled, className, trigger }: SendToPhoneProps) {
  const [open, setOpen] = React.useState(false);
  const [built, setBuilt] = React.useState<Built | null>(null);
  // Read through a ref so a parent's inline callback does not re-run the encoding on every render.
  const getDataRef = React.useRef(getData);
  getDataRef.current = getData;

  React.useEffect(() => {
    if (!open) {
      setBuilt(null);
      return;
    }
    let cancelled = false;
    void Promise.resolve()
      .then(() => getDataRef.current())
      .then((data) => build(kind, toolPath, data))
      .catch((): Built => ({ failed: true }))
      .then((result) => {
        if (!cancelled) setBuilt(result);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, toolPath]);

  const failed = built !== null && "failed" in built;
  const tooLarge = built !== null && "ok" in built && !built.ok ? built : null;

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <ActionButton variant="secondary" className={className} disabled={disabled} onClick={() => setOpen(true)}>
          {ts(lang, "button")}
        </ActionButton>
      )}
      <Modal open={open} onClose={() => setOpen(false)} label={ts(lang, "title")} className="lab-modal-md">
        <div className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{tooLarge ? ts(lang, "tooLargeTitle") : ts(lang, "title")}</h2>
          {built && "ok" in built && built.ok ? (
            <>
              <div
                role="img"
                aria-label={ts(lang, "qrLabel")}
                className="mx-auto w-full max-w-72 overflow-hidden rounded-lg border border-(--border) [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                // Our own generator's output (numbers and fixed colours), never user markup.
                dangerouslySetInnerHTML={{ __html: built.svg }}
              />
              <p className="text-sm">{ts(lang, "scanHint")}</p>
              <p className="text-xs text-(--muted-fg)">{ts(lang, "size", { n: built.size, max: MAX_FRAGMENT_CHARS })}</p>
              <p className="text-xs text-(--muted-fg)">{ts(lang, "privacy")}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton lang={lang} text={built.link} label={ts(lang, "copyLink")} />
                <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => setOpen(false)}>
                  {ts(lang, "close")}
                </ActionButton>
              </div>
            </>
          ) : (
            (tooLarge || failed) && (
              <>
                <p className="text-sm">
                  {tooLarge ? ts(lang, "tooLarge", { n: tooLarge.size, max: MAX_FRAGMENT_CHARS }) : ts(lang, "readFailed")}
                </p>
                <div>
                  <ActionButton onClick={() => setOpen(false)}>{ts(lang, "close")}</ActionButton>
                </div>
              </>
            )
          )}
        </div>
      </Modal>
    </>
  );
}
