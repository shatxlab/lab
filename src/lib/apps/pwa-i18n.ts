import { createTranslator } from "@/lib/apps/i18n";

export const tpw = createTranslator({
  en: {
    updateAvailable: "A new version of lab is available.",
    reload: "Reload",
    later: "Later",
    offlineReady: "lab is ready to work offline.",
    dismiss: "Dismiss",
  },
  ru: {
    updateAvailable: "Доступна новая версия lab.",
    reload: "Обновить",
    later: "Позже",
    offlineReady: "lab готов работать без интернета.",
    dismiss: "Закрыть",
  },
});
