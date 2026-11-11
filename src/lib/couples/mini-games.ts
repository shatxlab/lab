import type { GameDef, Lang } from "./types";

/** Separate from GameId: these games have no question deck or agreement score. */
export type MiniGameId = "pattern";
export const MINI_GAMES: readonly (Omit<GameDef, "id"> & { id: MiniGameId })[] = [
  {
    id: "pattern", emoji: "🧩",
    name: { en: "Secret Pattern", ru: "Тайный узор" },
    tagline: { en: "Describe · build · reveal", ru: "Объясняйте и собирайте" },
    description: {
      en: "One sees the pattern, the other rebuilds it. Five rounds, one shared challenge, unlimited peeks.",
      ru: "Один видит узор, другой собирает его по описанию. Пять раундов, общая цель и подсказки без ограничений.",
    },
    gradient: "linear-gradient(135deg, #115e59, #0f766e)", accent: "#5eead4",
  },

];

export const PATTERN_ROUNDS = 5;
export type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type Pattern = readonly Tile[];
export function patternDifficulty(round: number) {
  const level = Math.max(0, Math.min(4, Math.floor(round)));
  return { count: 3 + level, colors: Math.min(4, 1 + level) };
}
export function tileShape(tile: Tile) { return (tile - 1) % 3; }
export function tileColor(tile: Tile) { return Math.floor((tile - 1) / 3); }
export function patternTools(round: number): Tile[] {
  return Array.from({ length: 1 + patternDifficulty(round).colors * 3 }, (_, i) => i as Tile);
}

export function generatePattern(round: number, random: () => number = Math.random): Tile[] {
  const positions = Array.from({ length: 9 }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const board: Tile[] = Array(9).fill(0);
  const { count, colors } = patternDifficulty(round);
  const offset = Math.floor(random() * colors);
  positions.slice(0, count).forEach((position, i) => {
    // Every unlocked colour appears; shape and colour are independent.
    board[position] = (1 + Math.floor(random() * 3) + ((i + offset) % colors) * 3) as Tile;
  });
  return board;
}

export function scorePattern(target: Pattern, draft: Pattern) {
  const total = target.filter((tile) => tile !== 0).length;
  const correct = target.filter((tile, i) => tile !== 0 && tile === draft[i]).length;
  const extra = draft.filter((tile, i) => tile !== 0 && target[i] === 0).length;
  const perfect = target.length === draft.length && target.every((tile, i) => tile === draft[i]);
  return { correct, total, extra, perfect };
}

// Rules and UI only: no authored prompt deck, and no private state is persisted.
const en = {
  rules: "How to play", start: "Start game", back: "Back", exit: "Exit game",
  cancel: "Keep playing", leave: "Leave game", exitTitle: "Leave this game?",
  exitBody: "This game's progress will be discarded. Patterns and results are not saved.",
  names: "What are your names?", firstName: "First name", secondName: "Second name",
  again: "Play again", menu: "Choose another game", round: "Round", next: "Next round", finish: "See results",
  pass: "Pass the phone", ready: "I'm {name} — ready", lookAway: "Only {name} should look at the next screen.",
  privacy: "Your partner should look away. Private screens are hidden during handoffs.",
  noStats: "Separate game results — no effect on your question-game agreement stats. Reloading ends this game.",
  patternRules: "Play five rounds as a team. The describer studies a 3 × 3 pattern, then passes the phone to the builder and describes it from memory. Patterns grow from 3 to 7 tiles, with up to four colours. Remember both shape and colour. The builder picks a coloured shape and taps cells to place it. Take as many private peeks as you like, then reveal together. Swap roles each round. No timer, no peek penalty.",
  describe: "{name} describes", build: "{name} builds", study: "Study the pattern",
  studyHint: "Top means the top of the screen for both of you. Keep the phone upright when passing it.",
  toBuilder: "Hide & pass to {name}", buildHint: "Select a shape + colour, then tap a cell. Use the eraser to clear a cell.",
  peek: "Ask {name} to peek", peekTitle: "Take another look", peekHint: "The builder's draft is hidden and will be restored after the handoff.",
  reveal: "Reveal together", revealHint: "Ready? Let both of you look before revealing the original.",
  original: "Original", rebuilt: "Your pattern", palette: "Choose a tile", board: "Pattern grid",
  tile0: "Empty / eraser", difficulty: "{count} tiles · {colors} colours",
  cell: "Row {row}, column {col}: {tile}", correct: "Correctly placed tiles", extra: "Extra tiles in empty cells",
  perfect: "Perfect pattern!", compare: "Compare your patterns", peeks: "Peeks", patternSummary: "Your shared result",
  perfectCount: "Perfect patterns", patternClosing: "One team, two perspectives. Try swapping how you describe positions next time.",
};
type MiniStrings = Record<keyof typeof en, string>;
const ru: MiniStrings = {
  rules: "Как играть", start: "Начать игру", back: "Назад", exit: "Выйти из игры",
  cancel: "Продолжить", leave: "Выйти", exitTitle: "Выйти из игры?",
  exitBody: "Прогресс этой игры будет потерян. Узоры и результаты не сохраняются.",
  names: "Как вас зовут?", firstName: "Первое имя", secondName: "Второе имя",
  again: "Сыграть ещё", menu: "Выбрать другую игру", round: "Раунд", next: "Следующий раунд", finish: "К итогам",
  pass: "Передайте телефон", ready: "Я {name} — можно", lookAway: "Следующий экран смотрит только {name}.",
  privacy: "Партнёр отворачивается. На экранах передачи телефона скрыты все секреты.",
  noStats: "Отдельные итоги: статистика совпадений в играх с вопросами не меняется. Перезагрузка завершит эту игру.",
  patternRules: "Пять раундов в одной команде. Объясняющий изучает узор 3 × 3, передаёт телефон собирающему и описывает узор по памяти. Узоры усложняются: от 3 до 7 фигур и до четырёх цветов. Запоминайте и форму, и цвет. Собирающий выбирает цветную фигуру и нажимает на клетки. Можно сколько угодно подсматривать через приватную передачу телефона. Затем откройте узоры вместе. Каждый раунд меняйтесь ролями. Без таймера и штрафов за подсказки.",
  describe: "{name} объясняет", build: "{name} собирает", study: "Изучите узор",
  studyHint: "Верх — это верх экрана для вас обоих. Не переворачивайте телефон при передаче.",
  toBuilder: "Скрыть и передать: {name}", buildHint: "Выберите фигуру нужного цвета и нажмите на клетку. Ластик очищает клетку.",
  peek: "Попросить подсказку: {name}", peekTitle: "Посмотрите ещё раз", peekHint: "Собранный узор скрыт и вернётся после передачи телефона.",
  reveal: "Открыть вместе", revealHint: "Готовы? Посмотрите на экран вдвоём перед открытием оригинала.",
  original: "Оригинал", rebuilt: "Ваш узор", palette: "Выберите фигуру", board: "Сетка узора",
  tile0: "Пусто / ластик", difficulty: "Фигур: {count} · цветов: {colors}",
  cell: "Строка {row}, столбец {col}: {tile}", correct: "Фигур на своих местах", extra: "Лишних фигур в пустых клетках",
  perfect: "Точное совпадение!", compare: "Сравните узоры", peeks: "Подсказки", patternSummary: "Ваш общий результат",
  perfectCount: "Точных узоров", patternClosing: "Одна команда, два взгляда. В следующий раз попробуйте иначе описывать позиции.",
};
export function miniStrings(lang: Lang): MiniStrings { return lang === "ru" ? ru : en; }
export function miniText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
export function tileName(tile: Tile, lang: Lang): string {
  if (tile === 0) return miniStrings(lang).tile0;
  const shapes = lang === "ru" ? ["круг", "треугольник", "квадрат"] : ["circle", "triangle", "square"];
  const colors = lang === "ru" ? ["Бирюзовый", "Оранжевый", "Фиолетовый", "Розовый"] : ["Teal", "Orange", "Purple", "Pink"];
  return `${colors[tileColor(tile)]} ${shapes[tileShape(tile)]}`;
}
