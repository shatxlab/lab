import * as React from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Align near the top (palette) instead of the centre (dialogs). */
  top?: boolean;
  /** Element to focus on open; defaults to the first focusable one. */
  initialFocus?: React.RefObject<HTMLElement | null>;
};

/**
 * Accessible modal: portalled to <body> (the sticky header's backdrop-filter
 * would otherwise trap `position: fixed`), focus-trapped, closes on Escape or
 * a backdrop click and gives focus back to whatever opened it.
 */
export function Modal({ open, onClose, label, children, className = "", top = false, initialFocus }: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = initialFocus?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    first?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, initialFocus]);

  if (!open || typeof document === "undefined") return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Keep page-level shortcuts (viewer Escape, reader arrows) from firing.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (nodes.length === 0) {
      event.preventDefault();
      return;
    }
    const firstNode = nodes[0]!;
    const lastNode = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === firstNode) {
      event.preventDefault();
      lastNode.focus();
    } else if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault();
      firstNode.focus();
    }
  };

  return createPortal(
    <div
      className={`lab-modal-backdrop${top ? " lab-modal-top" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`lab-modal ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
