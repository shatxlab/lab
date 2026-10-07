import { createTranslator } from "@/lib/apps/i18n";

/** Copy shared by the small-tool components (FilePicker, CopyButton, ...). */
export const tc = createTranslator({
  en: {
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copy failed",
    dropFiles: "Drop files here, or click to browse",
    dropFile: "Drop a file here, or click to browse",
    dropActive: "Drop to open",
    download: "Download",
    clear: "Clear",
    remove: "Remove",
    privacy: "Everything runs in your browser — your data stays on your device.",
    fileTooLarge: "{name} is too large (limit {limit}).",
    readError: "Could not read {name}.",
  },
  ru: {
    copy: "Копировать",
    copied: "Скопировано",
    copyFailed: "Не удалось скопировать",
    dropFiles: "Перетащите файлы сюда или нажмите для выбора",
    dropFile: "Перетащите файл сюда или нажмите для выбора",
    dropActive: "Отпустите, чтобы открыть",
    download: "Скачать",
    clear: "Очистить",
    remove: "Убрать",
    privacy: "Всё работает в браузере — данные остаются на вашем устройстве.",
    fileTooLarge: "{name} слишком большой (лимит {limit}).",
    readError: "Не удалось прочитать {name}.",
  },
});
