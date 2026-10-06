import { Languages, Gift, ShieldCheck, WifiOff } from "lucide-react";

import { BRAND } from "@/lib/brand";
import { CATEGORY_ORDER, CATEGORY_TITLES, toolHref, toolsByCategory } from "@/lib/apps/tools";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";

/**
 * The tools index. A client island so the cards follow the shared language
 * setting from the header toggle. Cards are grouped by category and read from
 * the shared registry (also used by the command palette).
 */
export default function ToolsGrid() {
  const lang = useAppLang();
  const readyRef = useLangReady<HTMLElement>();
  const sentences = BRAND.tagline[lang].split(/(?<=\.)\s+/);

  return (
    <section
      ref={readyRef}
      data-lang-sensitive=""
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-[18px] py-10"
    >
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-(--fg) sm:text-5xl">
          {sentences.map((sentence, index) => (
            <span key={sentence} className={index === sentences.length - 1 ? "block text-(--accent)" : "mr-2"}>
              {sentence}
            </span>
          ))}
        </h1>
        <p className="max-w-2xl text-base text-(--muted-fg) sm:text-lg">{BRAND.pitch[lang]}</p>
        <ul className="flex flex-wrap gap-2" aria-label={lang === "ru" ? "Главное" : "Highlights"}>
          {BRAND.promises[lang].map((promise, index) => {
            const Icon = [ShieldCheck, WifiOff, Gift, Languages][index] ?? ShieldCheck;
            return (
              <li
                key={promise}
                className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-sm text-(--fg)"
              >
                <Icon aria-hidden="true" className="size-4 text-(--accent)" />
                {promise}
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-(--muted-fg)">
          {lang === "ru" ? "Нажмите Ctrl+K, чтобы быстро найти нужный инструмент." : "Press Ctrl+K to jump to any tool."}
        </p>
      </header>

      {CATEGORY_ORDER.map((category) => (
        <section key={category} aria-labelledby={`tools-${category}`} className="flex flex-col gap-3">
          <h2 id={`tools-${category}`} className="text-sm font-semibold uppercase tracking-widest text-(--muted-fg)">
            {CATEGORY_TITLES[category][lang]}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {toolsByCategory(category).map((tool) => (
              <a
                key={tool.id}
                href={toolHref(tool)}
                className="group block rounded-xl border border-(--border) bg-(--surface) p-5 no-underline transition-colors hover:border-(--accent)"
              >
                <span className="text-xs text-(--muted-fg)">{tool.files[lang]}</span>
                <h3 className="mt-1 text-lg font-semibold text-(--fg) transition-colors group-hover:text-(--accent)">
                  {tool.title[lang]}
                </h3>
                <p className="mt-2 text-sm text-(--muted-fg)">{tool.description[lang]}</p>
              </a>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
