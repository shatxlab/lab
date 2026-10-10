import { createTranslator } from "@/lib/apps/i18n";

export const tt = createTranslator({
  en: {
    title: "Text tools",
    tagline: "Compare texts, count words, change letter case and test regular expressions — all in your browser.",

    original: "Original",
    modified: "Modified",
    pasteHere: "Paste or type text…",
    swap: "Swap sides",
    clear: "Clear",
    fileTooLarge: "That file is too large for the text tools (limit {limit}).",
    diffEmpty: "Paste two texts above to see what changed.",

    noWords: "No words yet.",


  },
  ru: {
    title: "Текстовые инструменты",
    tagline: "Сравнение текстов, подсчёт слов, смена регистра и проверка регулярных выражений — прямо в браузере.",

    original: "Оригинал",
    modified: "Изменённый",
    pasteHere: "Вставьте или введите текст…",
    swap: "Поменять местами",
    clear: "Очистить",
    fileTooLarge: "Файл слишком большой для текстовых инструментов (лимит {limit}).",
    diffEmpty: "Вставьте два текста выше, чтобы увидеть различия.",

    noWords: "Пока нет слов.",


  },
});
