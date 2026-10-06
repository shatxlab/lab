import * as React from "react";
import { Search } from "lucide-react";

import { Modal } from "@/components/apps/Modal";
import { cn } from "@/lib/viewer/utils";
import { EXPORT_SETTINGS_EVENT, OPEN_SETTINGS_EVENT } from "@/components/apps/SettingsButton";
import { th } from "@/lib/apps/header-i18n";
import { changeAppLang, readAppLang, subscribeToAppLang, type AppLang } from "@/lib/apps/lang";
import { filterItems, type PaletteItem } from "@/lib/apps/palette";
import { withBase } from "@/lib/apps/paths";
import { applyTheme, initTheme, persistTheme } from "@/lib/apps/theme";
import { CATEGORY_TITLES, TOOLS, toolHref } from "@/lib/apps/tools";

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function buildItems(lang: AppLang): PaletteItem[] {
  const tools: PaletteItem[] = TOOLS.map((tool) => ({
    id: `tool:${tool.id}`,
    group: "tools",
    title: tool.title[lang],
    hint: CATEGORY_TITLES[tool.category][lang],
    // Both languages' titles so "crossword" finds Кроссворд and vice versa.
    keywords: `${tool.keywords} ${tool.title.en} ${tool.title.ru}`,
    href: toolHref(tool),
  }));

  const actions: PaletteItem[] = [
    { id: "act:home", group: "actions", title: th(lang, "actHome"), keywords: "home index главная", href: withBase("/") },
    {
      id: "act:theme",
      group: "actions",
      title: th(lang, "actTheme"),
      keywords: "dark light theme night тема тёмная светлая",
      run: () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        persistTheme(next);
      },
    },
    {
      id: "act:lang",
      group: "actions",
      title: th(lang, lang === "en" ? "actLangRu" : "actLangEn"),
      keywords: "language english russian русский английский язык",
      run: () => changeAppLang(lang === "en" ? "ru" : "en"),
    },
    {
      id: "act:export",
      group: "actions",
      title: th(lang, "actExport"),
      keywords: "backup export save settings резервная копия экспорт",
      run: () => window.dispatchEvent(new CustomEvent(EXPORT_SETTINGS_EVENT)),
    },
    {
      id: "act:import",
      group: "actions",
      title: th(lang, "actImport"),
      keywords: "backup import restore settings резервная копия импорт восстановить",
      run: () => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT)),
    },
  ];
  return [...tools, ...actions];
}

/**
 * Header command palette: Ctrl/⌘+K from any page opens a fuzzy search over
 * every tool (from the shared registry) plus a few global actions.
 */
export default function CommandPalette() {
  const [lang, setLang] = React.useState<AppLang>("en");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [mac, setMac] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    setLang(readAppLang());
    setMac(isMac());
    return subscribeToAppLang(setLang);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const items = React.useMemo(() => buildItems(lang), [lang]);
  const results = React.useMemo(() => filterItems(items, query), [items, query]);

  React.useEffect(() => setActive(0), [query, open]);

  React.useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active, results]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    if (item.href) window.location.assign(item.href);
    else item.run?.();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (results.length === 0 ? 0 : (value + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (results.length === 0 ? 0 : (value - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active]);
    }
  };

  const shortcut = mac ? "⌘K" : "Ctrl K";
  const activeId = results[active] ? `${listId}-${results[active]!.id}` : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // The accessible name must contain the visible text, shortcut hint included.
        aria-label={`${th(lang, "paletteOpen")} ${shortcut}`}
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        className="lab-search-button"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        <span className="lab-search-text">{th(lang, "paletteOpen")}</span>{" "}
        <kbd className="lab-kbd" aria-hidden="true">
          {shortcut}
        </kbd>
      </button>

      <Modal open={open} onClose={close} label={th(lang, "paletteLabel")} top initialFocus={inputRef} className="lab-modal-palette">
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-2 border-b border-(--border) px-4">
            <Search aria-hidden="true" className="size-4 shrink-0 text-(--muted-fg)" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label={th(lang, "palettePlaceholder")}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={th(lang, "palettePlaceholder")}
              className="h-12 w-full bg-transparent text-base text-(--fg) outline-none placeholder:text-(--muted-fg)"
            />
          </div>

          <ul id={listId} ref={listRef} role="listbox" aria-label={th(lang, "paletteLabel")} className="max-h-[50vh] overflow-y-auto p-2">
            {results.map((item, index) => {
              const showHeading = index === 0 || results[index - 1]!.group !== item.group;
              return (
                <React.Fragment key={item.id}>
                  {showHeading && (
                    <li role="presentation" className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-(--muted-fg)">
                      {th(lang, item.group === "tools" ? "groupTools" : "groupActions")}
                    </li>
                  )}
                  <li
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(item)}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-(--accent) aria-selected:text-(--accent-fg)"
                  >
                    <span>{item.title}</span>
                    {item.hint && <span className={cn("text-xs", index !== active && "text-(--muted-fg)")}>{item.hint}</span>}
                  </li>
                </React.Fragment>
              );
            })}
          </ul>

          <p role="status" className="sr-only">
            {results.length === 0 ? th(lang, "paletteEmpty", { query }) : th(lang, "paletteResults", { count: results.length })}
          </p>
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-(--muted-fg)">{th(lang, "paletteEmpty", { query })}</p>
          )}

          <div className="hidden gap-4 border-t border-(--border) px-4 py-2 text-xs text-(--muted-fg) sm:flex">
            <span>{th(lang, "hintNav")}</span>
            <span>{th(lang, "hintEnter")}</span>
            <span>{th(lang, "hintEsc")}</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
