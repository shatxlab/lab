import { createTranslator } from "@/lib/apps/i18n";

export const ts = createTranslator({
  en: {
    button: "Send to phone",
    title: "Send to your phone",
    qrLabel: "QR code holding a link that carries the data",
    scanHint: "Open your phone's camera and point it at this code. The link opens this tool with the data ready to import.",
    size: "{n} of {max} characters",
    privacy: "The data is inside the link itself and nothing is uploaded. Anyone who sees this code or link can read it.",
    copyLink: "Copy link",
    close: "Close",
    tooLargeTitle: "Too big for a QR code",
    tooLarge: "This is {n} characters and a code holds about {max}. Export it as a file instead and open that on your phone.",
    readFailed: "Could not read this to send it.",

    receiveTitle: "Received from another device",
    receiveNote: "Check that it looks right. Nothing is added until you import.",
    import: "Import",
    dismiss: "Dismiss",
  },
  ru: {
    button: "Отправить на телефон",
    title: "Отправка на телефон",
    qrLabel: "QR-код со ссылкой, в которой лежат данные",
    scanHint: "Откройте камеру телефона и наведите её на этот код. Ссылка откроет этот инструмент с готовыми к импорту данными.",
    size: "{n} из {max} символов",
    privacy: "Данные лежат прямо в ссылке, ничего не загружается на сервер. Любой, кто увидит этот код или ссылку, сможет их прочитать.",
    copyLink: "Скопировать ссылку",
    close: "Закрыть",
    tooLargeTitle: "Слишком много для QR-кода",
    tooLarge: "Здесь {n} символов, а в код помещается около {max}. Лучше экспортируйте файл и откройте его на телефоне.",
    readFailed: "Не удалось прочитать данные для отправки.",

    receiveTitle: "Получено с другого устройства",
    receiveNote: "Проверьте, что всё выглядит верно. Пока вы не нажмёте «Импорт», ничего не добавится.",
    import: "Импорт",
    dismiss: "Отклонить",
  },
});
