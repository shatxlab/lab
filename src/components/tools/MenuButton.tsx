import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/viewer/utils";

export type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

type MenuButtonProps = {
  label: string;
  /** Accessible name of the popup menu itself. */
  menuLabel: string;
  items: readonly MenuItem[];
  icon?: React.ReactNode;
  className?: string;
  /** Hide the text label on narrow screens (icon-only). */
  collapseLabel?: boolean;
};

/**
 * Button that opens a small action menu (WAI-ARIA menu button pattern):
 * arrow keys move, Enter/Space choose, Escape closes and returns focus.
 */
export function MenuButton({ label, menuLabel, items, icon, className, collapseLabel = false }: MenuButtonProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const enabled = items.filter((item) => !item.disabled);

  const focusItem = (index: number) => {
    const count = items.length;
    for (let step = 0; step < count; step += 1) {
      const next = (index + step + count) % count;
      if (!items[next]?.disabled) {
        itemRefs.current[next]?.focus();
        return;
      }
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  React.useEffect(() => {
    if (open) focusItem(0);
    // Only run when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(current - 1 < 0 ? items.length - 1 : current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      // The viewer closes the open file on Escape; this one belongs to the menu.
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  if (enabled.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-(--border) bg-(--bg) px-3 text-xs font-medium text-(--fg) transition-colors hover:bg-(--surface)",
          className,
        )}
      >
        {icon}
        <span className={collapseLabel ? "hidden sm:inline" : undefined}>{label}</span>
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-40 mt-1 min-w-52 rounded-lg border border-(--border) bg-(--bg) p-1 shadow-lg"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              tabIndex={-1}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-(--fg) hover:bg-(--surface) focus:bg-(--surface) focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
