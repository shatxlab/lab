import type { GameDef, Lang } from "./types";

/** Separate from GameId: these games have no question deck or agreement score. */
export type MiniGameId = "pattern" | "split";
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
  {
    id: "split", emoji: "🪙",
    name: { en: "Split or Steal", ru: "Делить или забрать" },
    tagline: { en: "A little bluff, a big reveal", ru: "Блефуйте и удивляйтесь" },
    description: {
      en: "Make a promise. Choose in secret. Reveal together. Eight rounds of strictly fictional coins.",
      ru: "Договоритесь, тайно выберите и откройте решения вместе. Восемь раундов на вымышленные монеты.",
    },
    gradient: "linear-gradient(135deg, #854d0e, #a16207)", accent: "#fde68a",
  },
];

export const PATTERN_ROUNDS = 5;
export const SPLIT_ROUNDS = 8;
export type Player = 0 | 1;
export type Tile = 0 | 1 | 2 | 3;
export type Pattern = readonly Tile[];
export const TILE_SYMBOLS = ["·", "●", "▲", "■"] as const;

export function generatePattern(round: number, random: () => number = Math.random): Tile[] {
  const positions = Array.from({ length: 9 }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const board: Tile[] = Array(9).fill(0);
  const count = Math.min(5, 3 + Math.floor((Math.max(0, round) + 1) / 2));
  positions.slice(0, count).forEach((position) => {
    board[position] = (1 + Math.floor(random() * 3)) as Tile;
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

export type SplitChoice = "split" | "steal";
export function splitPayoff(a: SplitChoice, b: SplitChoice): [number, number] {
  if (a === "split" && b === "split") return [3, 3];
  if (a === "steal" && b === "steal") return [0, 0];
  return a === "steal" ? [5, 0] : [0, 5];
}
export interface SplitRound {
  choices: readonly [SplitChoice, SplitChoice];
  coins: readonly [number, number];
}
export function splitTotals(rounds: readonly SplitRound[]): [number, number] {
  return rounds.reduce<[number, number]>((sum, round) => [sum[0] + round.coins[0], sum[1] + round.coins[1]], [0, 0]);
}

// Rules and UI only: no authored prompt deck, and no private state is persisted.
const en = {
  rules: "How to play", start: "Start game", back: "Back", exit: "Exit game",
  cancel: "Keep playing", leave: "Leave game", exitTitle: "Leave this game?",
  exitBody: "This game's progress will be discarded. Patterns, choices and results are not saved.",
  names: "What are your names?", firstName: "First name", secondName: "Second name",
  again: "Play again", menu: "Choose another game", round: "Round", next: "Next round", finish: "See results",
  pass: "Pass the phone", ready: "I'm {name} — ready", lookAway: "Only {name} should look at the next screen.",
  privacy: "Your partner should look away. Private screens are hidden during handoffs.",
  noStats: "Separate game results — no effect on your question-game agreement stats. Reloading ends this game.",
  patternRules: "Play five rounds as a team. The describer studies a 3 × 3 pattern, then passes the phone to the builder and describes it from memory. The builder picks a shape and taps cells to place it. Take as many private peeks as you like, then reveal together. Swap roles each round. No timer, no peek penalty.",
  describe: "{name} describes", build: "{name} builds", study: "Study the pattern",
  studyHint: "Top means the top of the screen for both of you. Keep the phone upright when passing it.",
  toBuilder: "Hide & pass to {name}", buildHint: "Select a tile, then tap a cell. Use the eraser to clear a cell.",
  peek: "Ask {name} to peek", peekTitle: "Take another look", peekHint: "The builder's draft is hidden and will be restored after the handoff.",
  reveal: "Reveal together", revealHint: "Ready? Let both of you look before revealing the original.",
  original: "Original", rebuilt: "Your pattern", palette: "Choose a tile", board: "Pattern grid",
  tile0: "Empty / eraser", tile1: "Teal circle", tile2: "Orange triangle", tile3: "Purple square",
  cell: "Row {row}, column {col}: {tile}", correct: "Correctly placed tiles", extra: "Extra tiles in empty cells",
  perfect: "Perfect pattern!", compare: "Compare your patterns", peeks: "Peeks", patternSummary: "Your shared result",
  perfectCount: "Perfect patterns", patternClosing: "One team, two perspectives. Try swapping how you describe positions next time.",
  negotiate: "Talk before you choose", splitRules: "Eight rounds. Before each round, negotiate freely — promises aren't binding. Each player then chooses privately. Both split: 3 coins each. One steals: the stealer gets 5, the other gets 0. Both steal: 0 each. Who chooses first alternates each round.",
  fiction: "Fictional coins only. No real stakes, penalties, or judgments about your relationship.",
  payoff: "Coins per round", bothSplit: "Both split", oneSteals: "One steals", bothSteal: "Both steal",
  each3: "3 each", steal5: "5 to stealer · 0 to splitter", each0: "0 each",
  firstChoose: "{name} chooses first", choose: "{name}, make your choice", chooseHint: "Tap to lock in. Your choice stays hidden until both have chosen.",
  split: "Split", steal: "Steal", locked: "Both choices are locked", lockedHint: "Get together for the reveal. Neither choice is shown yet.",
  roundResult: "Round results", coins: "coins", combined: "Combined haul", splitSummary: "The final haul",
  tie: "A tie!", ahead: "{name} finishes ahead", history: "Round history", splitClosing: "That was a game of bluffing, not a measure of trust. Fancy a rematch?",
};
type MiniStrings = Record<keyof typeof en, string>;
const ru: MiniStrings = {
  rules: "Как играть", start: "Начать игру", back: "Назад", exit: "Выйти из игры",
  cancel: "Продолжить", leave: "Выйти", exitTitle: "Выйти из игры?",
  exitBody: "Прогресс этой игры будет потерян. Узоры, решения и результаты не сохраняются.",
  names: "Как вас зовут?", firstName: "Первое имя", secondName: "Второе имя",
  again: "Сыграть ещё", menu: "Выбрать другую игру", round: "Раунд", next: "Следующий раунд", finish: "К итогам",
  pass: "Передайте телефон", ready: "Я {name} — можно", lookAway: "Следующий экран смотрит только {name}.",
  privacy: "Партнёр отворачивается. На экранах передачи телефона скрыты все секреты.",
  noStats: "Отдельные итоги: статистика совпадений в играх с вопросами не меняется. Перезагрузка завершит эту игру.",
  patternRules: "Пять раундов в одной команде. Объясняющий изучает узор 3 × 3, передаёт телефон собирающему и описывает узор по памяти. Собирающий выбирает фигуру и нажимает на клетки. Можно сколько угодно подсматривать через приватную передачу телефона. Затем откройте узоры вместе. Каждый раунд меняйтесь ролями. Без таймера и штрафов за подсказки.",
  describe: "{name} объясняет", build: "{name} собирает", study: "Изучите узор",
  studyHint: "Верх — это верх экрана для вас обоих. Не переворачивайте телефон при передаче.",
  toBuilder: "Скрыть и передать: {name}", buildHint: "Выберите фигуру и нажмите на клетку. Ластик очищает клетку.",
  peek: "Попросить подсказку: {name}", peekTitle: "Посмотрите ещё раз", peekHint: "Собранный узор скрыт и вернётся после передачи телефона.",
  reveal: "Открыть вместе", revealHint: "Готовы? Посмотрите на экран вдвоём перед открытием оригинала.",
  original: "Оригинал", rebuilt: "Ваш узор", palette: "Выберите фигуру", board: "Сетка узора",
  tile0: "Пусто / ластик", tile1: "Бирюзовый круг", tile2: "Оранжевый треугольник", tile3: "Фиолетовый квадрат",
  cell: "Строка {row}, столбец {col}: {tile}", correct: "Фигур на своих местах", extra: "Лишних фигур в пустых клетках",
  perfect: "Точное совпадение!", compare: "Сравните узоры", peeks: "Подсказки", patternSummary: "Ваш общий результат",
  perfectCount: "Точных узоров", patternClosing: "Одна команда, два взгляда. В следующий раз попробуйте иначе описывать позиции.",
  negotiate: "Сначала договоритесь", splitRules: "Восемь раундов. Перед каждым можно договариваться, но обещания не обязательны. Затем каждый тайно выбирает. Оба делят: по 3 монеты. Один забирает: ему 5, другому 0. Оба забирают: по 0. Каждый раунд первым выбирает другой игрок.",
  fiction: "Только вымышленные монеты. Без реальных ставок, наказаний и выводов о ваших отношениях.",
  payoff: "Монеты за раунд", bothSplit: "Оба делят", oneSteals: "Один забирает", bothSteal: "Оба забирают",
  each3: "По 3", steal5: "5 забирающему · 0 второму", each0: "По 0",
  firstChoose: "Первым выбирает {name}", choose: "{name}, ваш выбор", chooseHint: "Нажатие фиксирует решение. Оно скрыто до выбора обоих.",
  split: "Делить", steal: "Забрать", locked: "Оба решения приняты", lockedHint: "Теперь смотрите вдвоём. Пока ни одно решение не открыто.",
  roundResult: "Итоги раунда", coins: "монет", combined: "Общая добыча", splitSummary: "Итоговая добыча",
  tie: "Ничья!", ahead: "Впереди — {name}", history: "История раундов", splitClosing: "Это был блеф, а не проверка доверия. Сыграете ещё?",
};
export function miniStrings(lang: Lang): MiniStrings { return lang === "ru" ? ru : en; }
export function miniText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
export function tileName(tile: Tile, lang: Lang): string {
  return miniStrings(lang)[`tile${tile}`];
}
