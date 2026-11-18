import type { Difficulty, Lang } from "./types";

export const LANGS: readonly Lang[] = ["en", "ru"];

export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  ru: "Русский",
};

export const LANG_SHORT: Record<Lang, string> = {
  en: "EN",
  ru: "RU",
};

type StringKey =
  | "appName"
  | "tagline"
  | "language"
  | "chooseLanguage"
  // Picker
  | "pickTitle"
  | "pickSubtitle"
  | "wordsSuffix"
  | "solvedBadge"
  | "progressBadge"
  | "newBadge"
  | "open"
  // Difficulty
  | "easy"
  | "medium"
  | "hard"
  // Board
  | "across"
  | "down"
  | "clues"
  | "check"
  | "hint"
  | "clear"
  | "back"
  | "soundOn"
  | "soundOff"
  | "inputHint"
  | "inputHintMobile"
  // Live feedback
  | "wordSolved"
  | "letterRevealed"
  | "wrongMarked"
  | "noWrong"
  | "nothingToCheck"
  | "progressLabel"
  | "timeLabel"
  | "hintsLabel"
  // Completion
  | "completeTitle"
  | "completeWithHints"
  | "completeNoHints"
  | "playAgain"
  | "nextPuzzle"
  | "toList"
  // Confirm clear
  | "clearTitle"
  | "clearBody"
  | "cancel"
  | "confirm"
  | "close"
  | "prevClue"
  | "nextClue"
  | "toggleDirection"
  | "empty"
  | "hideKeyboard" | "gridView" | "zoomIn" | "zoomOut" | "fitGrid" | "readableSize" | "overview" | "panHint"
  | "emptyCell" | "cellPosition" | "inputLabel" | "legacyEdition" | "editionNotice";

const STRINGS: Record<Lang, Record<StringKey, string>> = {
  en: {
    appName: "Crossword",
    tagline: "English crosswords",
    language: "Language",
    chooseLanguage: "Pick a language for the puzzles.",

    // Picker
    pickTitle: "Pick a crossword",
    pickSubtitle: "Progress is saved in this browser",
    wordsSuffix: "words",
    solvedBadge: "Solved",
    progressBadge: "In progress",
    newBadge: "New",
    open: "Open",

    // Difficulty
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",

    // Board
    across: "Across",
    down: "Down",
    clues: "Words",
    check: "Check",
    hint: "Hint",
    clear: "Clear",
    back: "Back",
    soundOn: "Sound on",
    soundOff: "Sound off",
    inputHint: "Tap a cell and type letters",
    inputHintMobile: "Open the keyboard and type letters",

    // Live feedback
    wordSolved: "Word solved!",
    letterRevealed: "Letter revealed",
    wrongMarked: "Mistakes highlighted",
    noWrong: "No mistakes",
    nothingToCheck: "Nothing to check yet",
    progressLabel: "Solved",
    timeLabel: "Time",
    hintsLabel: "Hints",

    // Completion
    completeTitle: "Crossword solved!",
    completeWithHints: "Great job",
    completeNoHints: "Perfect — not a single hint",
    playAgain: "Play again",
    nextPuzzle: "Next",
    toList: "To the list",

    // Confirm clear
    clearTitle: "Clear the crossword?",
    clearBody: "All letters and hint markers will be removed. Hints used and elapsed time will be kept.",
    cancel: "Cancel",
    confirm: "Clear",

    close: "Close",
    prevClue: "Previous word",
    nextClue: "Next word",
    toggleDirection: "Change direction",
    empty: "—",
    hideKeyboard: "Hide keyboard", gridView: "Grid view", zoomIn: "Zoom in", zoomOut: "Zoom out", fitGrid: "Fit grid", readableSize: "Readable size",
    overview: "Overview", panHint: "Swipe or drag to pan · Tap a cell in overview to start typing",
    emptyCell: "empty cell", cellPosition: "row {row}, column {col}", inputLabel: "Crossword letter input",
    legacyEdition: "Previous edition", editionNotice: "10–50 words. Saved puzzles from the previous edition can still be resumed.",
  },
  ru: {
    appName: "Кроссворд",
    tagline: "Русские кроссворды",
    language: "Язык",
    chooseLanguage: "Выберите язык кроссвордов.",

    // Picker
    pickTitle: "Выберите кроссворд",
    pickSubtitle: "Прогресс сохраняется в этом браузере",
    wordsSuffix: "слов",
    solvedBadge: "Разгадан",
    progressBadge: "В процессе",
    newBadge: "Новый",
    open: "Открыть",

    // Difficulty
    easy: "Легко",
    medium: "Средне",
    hard: "Сложно",

    // Board
    across: "По горизонтали",
    down: "По вертикали",
    clues: "Слова",
    check: "Проверить",
    hint: "Подсказка",
    clear: "Очистить",
    back: "Назад",
    soundOn: "Звук включён",
    soundOff: "Звук выключен",
    inputHint: "Нажмите на клетку и вводите буквы",
    inputHintMobile: "Откройте клавиатуру и вводите буквы",

    // Live feedback
    wordSolved: "Слово отгадано!",
    letterRevealed: "Буква подсказана",
    wrongMarked: "Ошибки подсвечены",
    noWrong: "Ошибок нет",
    nothingToCheck: "Пока нечего проверять",
    progressLabel: "Решено",
    timeLabel: "Время",
    hintsLabel: "Подсказок",

    // Completion
    completeTitle: "Кроссворд разгадан!",
    completeWithHints: "Отличная работа",
    completeNoHints: "Идеально, без единой подсказки",
    playAgain: "Ещё раз",
    nextPuzzle: "Следующий",
    toList: "К списку",

    // Confirm clear
    clearTitle: "Очистить кроссворд?",
    clearBody: "Все буквы и отметки подсказок будут удалены. Число использованных подсказок и время сохранятся.",
    cancel: "Отмена",
    confirm: "Очистить",

    close: "Закрыть",
    prevClue: "Предыдущее слово",
    nextClue: "Следующее слово",
    toggleDirection: "Сменить направление",
    empty: "—",
    hideKeyboard: "Скрыть клавиатуру", gridView: "Вид сетки", zoomIn: "Увеличить", zoomOut: "Уменьшить", fitGrid: "Вся сетка", readableSize: "Удобный размер клеток",
    overview: "Обзор", panHint: "Листайте или перетаскивайте сетку · Нажмите клетку в обзоре для ввода",
    emptyCell: "пустая клетка", cellPosition: "ряд {row}, столбец {col}", inputLabel: "Ввод букв кроссворда",
    legacyEdition: "Прошлая версия", editionNotice: "От 10 до 50 слов. Сохранённые кроссворды прошлой версии по-прежнему доступны.",
  },
};

export type TranslationKey = StringKey;

export type TXT = Record<StringKey, string>;

/** All UI strings for one language, for `TXT[lang].key` access. */
export function stringsFor(lang: Lang): TXT {
  return STRINGS[lang];
}

/** Translate a key, interpolating `{placeholders}` from `vars`. */
export function t(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type DifficultyKey = Difficulty;

export function difficultyLabel(lang: Lang, difficulty: Difficulty): string {
  return STRINGS[lang][difficulty];
}

export function progressText(solved: number, total: number): string {
  return `${solved}/${total}`;
}
