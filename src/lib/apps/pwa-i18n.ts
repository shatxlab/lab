import { createTranslator } from "@/lib/apps/i18n";

export const tpw = createTranslator({
  en: {
    updateAvailable: "A new version of Local Lab is available.",
    reload: "Reload",
    later: "Later",
    offlineReady: "Local Lab is ready to work offline.",
    dismiss: "Dismiss",
  },
  ru: {
    updateAvailable: "Доступна новая версия Local Lab.",
    reload: "Обновить",
    later: "Позже",
    offlineReady: "Local Lab готов работать без интернета.",
    dismiss: "Закрыть",
  },
});
