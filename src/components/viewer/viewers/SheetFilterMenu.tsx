import * as React from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/viewer/ui/button";
import type { AppLang } from "@/lib/apps/lang";
import { t } from "@/lib/viewer/i18n";
import { columnLabel } from "@/lib/viewer/sheet";

/**
 * Excel-style AutoFilter list for one column: every distinct value in the
 * column body with a checkbox, a search box to narrow long lists, and
 * Apply / Clear. The draft is local until Apply, so Escape and a stray
 * outside click change nothing.
 *
 * The panel is `position: fixed` under its header button rather than absolute
 * inside the sticky `<th>`, so the grid's overflow scroller cannot clip it.
 */
export function SheetFilterMenu({
  lang,
  column,
  values,
  selected,
  anchor,
  onApply,
  onClose,
}: {
  lang: AppLang;
  column: number;
  /** Distinct body values of this column, sorted; "" stands for blank cells. */
  values: readonly string[];
  /** Currently allowed values; undefined means no filter (everything passes). */
  selected: ReadonlySet<string> | undefined;
  /** The header button the menu hangs from. */
  anchor: HTMLElement;
  /** Receives the next allowed set, or null when the filter is removed. */
  onApply: (allowed: ReadonlySet<string> | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState<ReadonlySet<string>>(() => new Set(selected ?? values));
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const needle = query.trim().toLocaleLowerCase();
  const shown = values.filter((value) => {
    if (!needle) return true;
    return displayValue(value, lang).toLocaleLowerCase().includes(needle);
  });

  const allChecked = draft.size >= values.length;
  const apply = () => {
    // Checking everything back is the same as having no filter at all.
    onApply(draft.size >= values.length ? null : draft);
    onClose();
  };

  const toggleAll = () => {
    setDraft(allChecked ? new Set<string>() : new Set(values));
  };

  const toggleValue = (value: string) => {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const position = menuPosition(anchor);

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={t(lang, "filterColumn", { column: columnLabel(column) })}
        style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }}
        onKeyDown={(event) => {
          // Escape closes the menu only; the sheet's own handlers stay quiet.
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="fixed z-50 flex w-64 flex-col overflow-hidden rounded-lg border border-(--border) bg-(--bg) shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-(--border) px-3 py-2">
          <Search className="size-4 shrink-0 text-(--muted-fg)" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(lang, "filterSearchValues")}
            aria-label={t(lang, "filterSearchValues")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--muted-fg)"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-(--muted-fg)">{t(lang, "filterNoValues")}</p>
          ) : (
            <>
              <FilterChoice
                label={t(lang, "filterSelectAll")}
                checked={allChecked}
                indeterminate={!allChecked && draft.size > 0}
                onToggle={toggleAll}
              />
              {shown.map((value) => (
                <FilterChoice
                  key={value}
                  label={displayValue(value, lang)}
                  checked={draft.has(value)}
                  onToggle={() => toggleValue(value)}
                />
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-(--border) p-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => { onApply(null); onClose(); }}>
            {t(lang, "filterClear")}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              {t(lang, "filterCancel")}
            </Button>
            <Button type="button" size="sm" disabled={draft.size === 0} onClick={apply}>
              {t(lang, "filterApply")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function FilterChoice({
  label,
  checked,
  indeterminate = false,
  onToggle,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-(--surface)">
      <input
        type="checkbox"
        checked={checked}
        ref={(input) => {
          if (input) input.indeterminate = indeterminate;
        }}
        onChange={onToggle}
        className="size-4 accent-(--accent)"
      />
      <span className="min-w-0 truncate" title={label}>
        {label}
      </span>
    </label>
  );
}

/** Blank cells have no text of their own to show in the list. */
function displayValue(value: string, lang: AppLang): string {
  return value === "" ? t(lang, "filterBlanks") : value;
}

type MenuPosition = { left: number; top: number; maxHeight: number };

/** Puts the panel under its button, clamped so it stays on screen. */
function menuPosition(anchor: HTMLElement): MenuPosition {
  const rect = anchor.getBoundingClientRect();
  const width = 256; // w-64
  const margin = 8;
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
  const top = Math.min(rect.bottom + 4, Math.max(margin, window.innerHeight - 120));
  return { left, top, maxHeight: Math.max(160, window.innerHeight - top - margin) };
}
