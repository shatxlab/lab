import { createTranslator } from "@/lib/apps/i18n";

export const tb = createTranslator({
  en: {
    title: "Whiteboard",
    tagline: "Sketch boxes, arrows and notes. Everything stays in this browser.",

    toolbar: "Tools",
    rect: "Rectangle",
    arrow: "Arrow",
    text: "Text",
    undo: "Undo",
    redo: "Redo",
    clear: "Clear the board",
    download: "Download PNG",
    exportFailed: "The picture could not be made.",

    canvas: "Whiteboard canvas with {n} elements",
    canvasHelp: "Pick a tool and drag to draw. Drag an element to move it, or the empty canvas to move the board. Two fingers, or Ctrl and the wheel, zoom.",
    hint: "Pick a tool and draw. Drag the canvas to move it.",
    elementList: "Elements on the board",
    kindRect: "Rectangle",
    kindArrow: "Arrow",
    kindText: "Text: {text}",
    textLabel: "Text",
    textHint: "Enter for a new line, Ctrl+Enter to finish",
  },
  ru: {
    title: "Доска",
    tagline: "Наброски из блоков, стрелок и заметок. Всё остаётся в этом браузере.",

    toolbar: "Инструменты",
    rect: "Прямоугольник",
    arrow: "Стрелка",
    text: "Текст",
    undo: "Отменить",
    redo: "Повторить",
    clear: "Очистить доску",
    download: "Скачать PNG",
    exportFailed: "Не удалось сделать картинку.",

    canvas: "Холст доски, элементов: {n}",
    canvasHelp: "Выберите инструмент и тяните, чтобы рисовать. Тяните элемент, чтобы переместить его, или пустой холст, чтобы сдвинуть доску. Два пальца или Ctrl и колесо — масштаб.",
    hint: "Выберите инструмент и рисуйте. Тяните холст, чтобы сдвинуть его.",
    elementList: "Элементы на доске",
    kindRect: "Прямоугольник",
    kindArrow: "Стрелка",
    kindText: "Текст: {text}",
    textLabel: "Текст",
    textHint: "Enter — новая строка, Ctrl+Enter — готово",
  },
});
