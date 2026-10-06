/**
 * UI copy. The crossword ships Russian-only for now; keeping every string in
 * one typed object makes a future English seed a matter of adding a locale,
 * not hunting through components.
 */

export const TXT = {
  appName: "Кроссворд",
  tagline: "Русские кроссворды",

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
  clearBody: "Все введённые буквы и подсказки будут удалены.",
  cancel: "Отмена",
  confirm: "Очистить",

  close: "Закрыть",
  prevClue: "Предыдущее слово",
  nextClue: "Следующее слово",
  toggleDirection: "Сменить направление",
  empty: "—",
} as const;

export type Difficulty = keyof Pick<typeof TXT, "easy" | "medium" | "hard">;

export function difficultyLabel(difficulty: Difficulty): string {
  return TXT[difficulty];
}

export function progressText(solved: number, total: number): string {
  return `${solved}/${total}`;
}
