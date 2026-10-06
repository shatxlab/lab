import { useEffect, useState } from "react";

import { withBase } from "@/lib/apps/paths";
import { readAppLang, subscribeToAppLang, type AppLang } from "@/lib/apps/lang";

interface ToolCard {
  href: string;
  files: Record<AppLang, string>;
  title: Record<AppLang, string>;
  description: Record<AppLang, string>;
}

const tools: ToolCard[] = [
  {
    href: withBase("/reader"),
    files: { en: ".epub", ru: ".epub" },
    title: { en: "EPUB reader", ru: "EPUB-читалка" },
    description: {
      en: "Open an EPUB and read it right in your browser — chapter navigation, themeable UI, reading position persisted locally.",
      ru: "Открывайте EPUB и читайте прямо в браузере — навигация по главам, темы оформления, позиция чтения сохраняется локально.",
    },
  },
  {
    href: withBase("/viewer"),
    files: { en: ".docx · .xlsx · .csv · .json · .md · .txt", ru: ".docx · .xlsx · .csv · .json · .md · .txt" },
    title: { en: "Document viewer", ru: "Просмотр документов" },
    description: {
      en: "Word documents, spreadsheets, JSON, Markdown and plain text, parsed and rendered locally. Spreadsheets are editable.",
      ru: "Документы Word, таблицы, JSON, Markdown и текст разбираются и показываются локально. Таблицы можно редактировать.",
    },
  },
  {
    href: withBase("/alias"),
    files: { en: "English · Русский · 10 themes", ru: "English · Русский · 10 тем" },
    title: { en: "Alias word game", ru: "Алиас" },
    description: {
      en: "The party word-guessing game: one player explains, the team guesses. Ten themed decks with 1000+ words each and sound feedback.",
      ru: "Компания угадывает слова: один объясняет, команда угадывает. Десять тематических колод по 1000+ слов со звуковыми подсказками.",
    },
  },
  {
    href: withBase("/crossword"),
    files: { en: "English · Русский · 100 crosswords", ru: "Русский · English · 100 кроссвордов" },
    title: { en: "Crossword", ru: "Кроссворд" },
    description: {
      en: "Bilingual crosswords with a phone-friendly grid, hints, mistake checking and saved progress.",
      ru: "Кроссворды на русском и английском: крупная сетка, подсказки, проверка ошибок и сохранение прогресса.",
    },
  },
  {
    href: withBase("/couples"),
    files: {
      en: "English · Русский · 3 games · 18 000 questions",
      ru: "Русский · English · 3 игры · 18 000 вопросов",
    },
    title: { en: "Games for couples", ru: "Игры для пар" },
    description: {
      en: "Fine or Cringe, This or That and Who of Us for two: answer in turns and see how much you match.",
      ru: "Норм или стрём, ИлиТо и Кто из нас для двоих: отвечайте по очереди и смотрите, насколько вы совпадаете.",
    },
  },
];

/**
 * The tools index. A client island so the cards follow the shared language
 * setting from the header toggle.
 */
export default function ToolsGrid() {
  const [lang, setLang] = useState<AppLang>(() => readAppLang());

  useEffect(() => subscribeToAppLang(setLang), []);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 px-[18px] py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-(--muted-fg)">
        {lang === "ru" ? "Инструменты" : "Tools"}
      </p>
      <h1 className="text-2xl font-bold text-(--fg)">
        {lang === "ru" ? "Выберите инструмент" : "Pick a tool"}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <a
            key={tool.href}
            href={tool.href}
            className="group block rounded-xl border border-(--border) bg-(--surface) p-5 no-underline transition-colors hover:border-(--accent)"
          >
            <span className="text-xs text-(--muted-fg)">{tool.files[lang]}</span>
            <h2 className="mt-1 text-lg font-semibold text-(--fg) transition-colors group-hover:text-(--accent)">
              {tool.title[lang]}
            </h2>
            <p className="mt-2 text-sm text-(--muted-fg)">{tool.description[lang]}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
