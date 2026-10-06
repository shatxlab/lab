import type { CrosswordPuzzle } from "@/lib/crossword/types";

/**
 * Small, stable boards for engine/UI tests. Content-independent tests keep
 * passing when the shipped puzzle set is regenerated.
 */
export const WARMUP_PUZZLE: CrosswordPuzzle = {
  id: "fixture-warmup",
  title: "Разминка",
  subtitle: "Тестовая сетка",
  difficulty: "easy",
  rows: 6,
  cols: 6,
  entries: [
    { answer: "ШКОЛА", clue: "Здание, где дети учатся", row: 0, col: 0, dir: "across" },
    { answer: "ОЗЕРО", clue: "Байкал — самое глубокое в мире", row: 0, col: 2, dir: "down" },
    { answer: "БАНАН", clue: "Жёлтый тропический фрукт", row: 1, col: 5, dir: "down" },
    { answer: "БЕЛКА", clue: "Пушистый грызун, который сушит грибы", row: 2, col: 1, dir: "across" },
    { answer: "ЛОЖКА", clue: "Столовый прибор для супа", row: 4, col: 1, dir: "across" },
  ],
};

export const WALK_PUZZLE: CrosswordPuzzle = {
  id: "fixture-walk",
  title: "Прогулка",
  subtitle: "Тестовая сетка",
  difficulty: "medium",
  rows: 8,
  cols: 8,
  entries: [
    { answer: "СТРАНА", clue: "Россия или Франция", row: 0, col: 7, dir: "down" },
    { answer: "МЕДУЗА", clue: "Морское существо со щупальцами", row: 1, col: 0, dir: "down" },
    { answer: "СОБАКА", clue: "Друг человека", row: 2, col: 3, dir: "down" },
    { answer: "КАМЕНЬ", clue: "Твёрдый минерал", row: 2, col: 5, dir: "down" },
    { answer: "ДОРОГА", clue: "Путь, по которому едут машины", row: 3, col: 0, dir: "across" },
    { answer: "РАКЕТА", clue: "Летит в космос с космодрома", row: 5, col: 2, dir: "across" },
    { answer: "ПЛАТЬЕ", clue: "Женская одежда", row: 7, col: 1, dir: "across" },
  ],
};
