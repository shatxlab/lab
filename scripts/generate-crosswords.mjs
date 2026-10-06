// Generates src/lib/crossword/wordbank.ts and src/lib/crossword/puzzles.ts.
//
// The word bank below is the single source of truth for answers and clues; the
// generator places words on grids with a greedy, crossing-first strategy and
// writes a self-consistent puzzle file. Run with `npm run gen:crosswords`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BANK_TEXT = `
АТОМ|Мельчайшая частица вещества
МОЛЕКУЛА|Соединение нескольких атомов
ЭЛЕКТРОН|Отрицательная частица в атоме
ПРОТОН|Положительная частица ядра
НЕЙТРОН|Нейтральная частица ядра
КВАРК|Составная часть протона
ФОТОН|Частица света
ЛАЗЕР|Узкий пучок света
РАДАР|Прибор, замечающий объекты по радиоволнам
ТЕЛЕСКОП|Прибор для наблюдения звёзд
МИКРОСКОП|Прибор для изучения мелкого
БАРОМЕТР|Измеряет атмосферное давление
ТЕРМОМЕТР|Измеряет температуру
ГЕНЕРАТОР|Превращает движение в электричество
ТУРБИНА|Колесо, вращаемое паром или водой
РЕАКТОР|Сердце атомной станции
АККУМУЛЯТОР|Накапливает и отдаёт заряд
АНТЕННА|Ловит радиоволны
ПРОЦЕССОР|Мозг компьютера
АЛГОРИТМ|Последовательность шагов решения
ПРОГРАММА|Набор команд для машины
ИНТЕРФЕЙС|Способ связи человека с программой
ПИКСЕЛЬ|Мельчайшая точка изображения
МОНИТОР|Экран компьютера
ПРИНТЕР|Печатает документы
СКАНЕР|Переводит бумагу в цифру
МОДЕМ|Соединяет с интернетом
ПАРОЛЬ|Секретное слово для входа
СЕРВЕР|Машина, отдающая сайты
БРАУЗЕР|Программа для интернета
ИМПЕРИЯ|Государство во главе с монархом
МОНАРХИЯ|Власть одного правителя
РЕСПУБЛИКА|Страна без монарха
ДЕМОКРАТИЯ|Власть народа
ПАРЛАМЕНТ|Законодательное собрание
ДИПЛОМАТ|Представитель страны за рубежом
РЕВОЛЮЦИЯ|Резкая смена власти
РЕФОРМА|Планомерное изменение
ДИНАСТИЯ|Ряд правителей одной семьи
ИМПЕРАТОР|Правитель империи
ФАРАОН|Царь Древнего Египта
ГЛАДИАТОР|Боец на арене Рима
АКРОПОЛЬ|Верхний город в Афинах
ПИРАМИДА|Усыпальница фараона
СФИНКС|Статуя с телом льва
ОБЕЛИСК|Высокий гранёный столб
МАНУСКРИПТ|Старинная рукопись
ПЕРГАМЕНТ|Материал для древних книг
СВИТОК|Скрученная рукопись
ЛЕТОПИСЬ|Запись событий по годам
АРТЕФАКТ|Предмет из прошлого
ЭКСПОНАТ|Предмет в музее
КОЛЛЕКЦИЯ|Собрание предметов
ПАЛИТРА|Дощечка для смешивания красок
МОЛЬБЕРТ|Подставка для холста
ЭТЮД|Небольшой набросок
НАТЮРМОРТ|Картина с предметами
ПЕЙЗАЖ|Картина природы
ПОРТРЕТ|Изображение человека
ФРЕСКА|Роспись по сырой штукатурке
МОЗАИКА|Картина из кусочков
ВИТРАЖ|Цветное стекло в окне
ГРАВЮРА|Оттиск с доски
ЭСКИЗ|Предварительный рисунок
КОЛОРИТ|Сочетание красок
ПЕРСПЕКТИВА|Изображение глубины на холсте
КОМПОЗИЦИЯ|Построение картины
ОРНАМЕНТ|Узор из повторяющихся фигур
БАРЕЛЬЕФ|Выпуклое изображение на стене
АРКА|Дугообразный проём
КУПОЛ|Круглая крыша
ФАСАД|Лицевая сторона здания
ПОРТАЛ|Парадный вход
КОЛОННА|Опора в виде столба
ВУЛКАН|Гора, извергающая лаву
ГЕЙЗЕР|Горячий фонтан из земли
ЛЕДНИК|Застывшая масса льда
АЙСБЕРГ|Плавучая ледяная гора
АТОЛЛ|Коралловый остров-кольцо
ЛАГУНА|Мелкий залив у моря
ПРОЛИВ|Узкая вода между берегами
ПОЛУОСТРОВ|Земля, омытая с трёх сторон
ПЛАТО|Ровная возвышенность
КАНЬОН|Глубокое ущелье
ПРЕРИЯ|Травянистая равнина Америки
САВАННА|Тропическая степь
ТУНДРА|Холодная безлесная равнина
ТАЙГА|Хвойный лес Сибири
БОЛОТО|Топкое место
ДЖУНГЛИ|Густой тропический лес
ОАЗИС|Зелёный остров в пустыне
МИРАЖ|Обманчивое видение в пустыне
ДЮНА|Песчаный холм
СТАЛАКТИТ|Сосулька в пещере сверху
СТАЛАГМИТ|Столбик в пещере снизу
ГРАНИТ|Твёрдый камень для памятников
БАЗАЛЬТ|Тёмная вулканическая порода
МРАМОР|Камень для скульптур
МАЛАХИТ|Зелёный поделочный камень
ЯНТАРЬ|Окаменевшая смола
ЖЕМЧУГ|Драгоценная бусина из раковины
КОРАЛЛ|Скелет морского полипа
ПЕРЛАМУТР|Радужный слой раковины
ВЫДРА|Речной хищник семейства куньих
БАРСУК|Ночной зверь с полосатой мордой
ГОРНОСТАЙ|Пушной зверёк, зимой белый
СОБОЛЬ|Ценный пушной зверёк Сибири
НОРКА|Пушной зверёк, живёт у воды
СУРОК|Спит всю зиму в норе
БОБР|Строит плотины на реке
ОНДАТРА|Грызун, похожий на бобра
ДИКОБРАЗ|Зверь в иглах
ЛЕНИВЕЦ|Самый медленный зверь
БРОНЕНОСЕЦ|Зверь в костяной броне
ТАПИР|Родственник лошади с хоботком
ОКАПИ|Животное с полосатыми ногами
АЛЬПАКА|Южноамериканский родич ламы
ГАЗЕЛЬ|Быстрая стройная антилопа
АНТИЛОПА|Рогатая жительница саванны
ГЕПАРД|Самый быстрый зверь
ЛЕОПАРД|Пятнистый хищник, отдыхает на дереве
ЯГУАР|Пятнистый хищник Америки
ПУМА|Хищник, он же кугуар
РЫСЬ|Кошка с кисточками на ушах
ГИЕНА|Падальщик с жутким хохотом
ШАКАЛ|Мелкий родич волка
ПЕСЕЦ|Белый полярный лис
ФЛАМИНГО|Розовая птица на одной ноге
ПЕЛИКАН|Птица с мешком под клювом
ЖУРАВЛЬ|Длинноногая птица с курлыканьем
БАКЛАН|Птица, ныряющая за рыбой
АЛЬБАТРОС|Морская птица с большим размахом
КОЛИБРИ|Самая маленькая птичка
ИВОЛГА|Жёлто-чёрная певчая птица
ТЕТЕРЕВ|Лесная птица, токует весной
ГЛУХАРЬ|Крупная птица, поёт на току
ПАПОРОТНИК|Растение с резными листьями без цветов
ОРХИДЕЯ|Экзотический цветок причудливой формы
КАКТУС|Колючее растение пустыни
БАОБАБ|Толстое дерево Африки
СЕКВОЙЯ|Самое высокое дерево
ЭВКАЛИПТ|Дерево, чьи листья любят коалы
ПЛАТАН|Дерево с пятнистой корой
ЯСЕНЬ|Дерево с перистыми листьями
ТОПОЛЬ|Дерево, дающее летний пух
ОСИНА|Дерево с дрожащими листьями
ОЛЬХА|Дерево у реки с серёжками
ЛИСТВЕННИЦА|Хвойное дерево, сбрасывающее иглы
ПИХТА|Хвойное дерево с мягкими иглами
КЕДР|Хвойное дерево с орешками
МАГНОЛИЯ|Дерево с крупными цветами
ЖАСМИН|Душистый куст с белыми цветами
СИРЕНЬ|Куст с лиловыми гроздьями
БОЯРЫШНИК|Колючий куст с красными ягодами
КАЛИНА|Куст с красными горькими ягодами
РЯБИНА|Дерево с оранжевыми гроздьями
ОБЛЕПИХА|Колючий куст с оранжевыми ягодами
СПАРЖА|Зелёный овощ с побегами
АРТИШОК|Овощ, похожий на шишку
БРОККОЛИ|Зелёная капуста с соцветиями
СЕЛЬДЕРЕЙ|Ароматный стебель для супа
ПАТИССОН|Плоская родня кабачка
БАКЛАЖАН|Фиолетовый овощ
КАБАЧОК|Продолговатый летний овощ
РЕДИС|Розовый острый корнеплод
БРЮКВА|Корнеплод, корм для скота
ТОПИНАМБУР|Земляная груша
ГОРЧИЦА|Острая приправа из семян
ИМБИРЬ|Жгучий корень для чая
ШАФРАН|Самая дорогая пряность
БАЗИЛИК|Ароматная зелень к пасте
РОЗМАРИН|Пряная веточка к мясу
КАРДАМОН|Пряность для кофе по-восточному
ВАНИЛЬ|Сладкая пряность из орхидеи
МУСКАТ|Пряный орех для выпечки
КОНТРАБАС|Самый большой смычковый инструмент
ВИОЛОНЧЕЛЬ|Струнный инструмент держат между колен
ГОБОЙ|Деревянный духовой с двойным язычком
ФАГОТ|Низкий деревянный духовой
КЛАРНЕТ|Духовой инструмент с клапанами
ТРОМБОН|Медный духовой с кулисой
ЛИТАВРЫ|Ударные котлы оркестра
ТАМБУРИН|Бубен с бубенчиками
КСИЛОФОН|Ударный из деревянных пластин
ЧЕЛЕСТА|Клавишный инструмент с нежным звоном
АРФА|Струнный инструмент ангелов
ЛЮТНЯ|Старинный струнный инструмент
МАНДОЛИН|Струнный инструмент с овальным корпусом
БАЛАЛАЙКА|Русский треугольный струнный
ДОМРА|Русский струнный с овальным корпусом
ГУСЛИ|Древнерусский струнный инструмент
ВОЛЫНКА|Шотландский духовой с мешком
ОРГАН|Самый большой клавишный инструмент
АДМИРАЛ|Высший морской чин
БОЦМАН|Старший над матросами
ШТУРМАН|Прокладывает курс корабля
ГАРПУН|Копьё для охоты на китов
ЯКОРЬ|Держит судно на месте
ШТУРВАЛ|Руль корабля
КАЮТА|Комната на судне
КУБРИК|Общая комната команды
ТРЮМ|Нижнее помещение судна
ПАЛУБА|Настил на корабле
МАЧТА|Вертикальная опора с парусами
КИЛЬ|Нижняя балка судна
ИЛЛЮМИНАТОР|Окно на корабле
СЕКСТАНТ|Прибор для определения широты
ФАРВАТЕР|Безопасный путь для судов
ШТИЛЬ|Полное безветрие
БРИЗ|Лёгкий ветер у берега
МУССОН|Сезонный ветер
ТАЙФУН|Тропический циклон
АНАЛОГИЯ|Сходство по признаку
АНТИТЕЗА|Противопоставление
ГИПОТЕЗА|Предположение для проверки
АКСИОМА|Утверждение без доказательства
ТЕОРЕМА|Утверждение с доказательством
ПРОПОРЦИЯ|Равенство двух отношений
ВЕКТОР|Направленный отрезок
МАТРИЦА|Таблица чисел
ИНТЕГРАЛ|Площадь под графиком
ФУНКЦИЯ|Зависимость величины от величины
КАТЕГОРИЯ|Общее понятие
КРИТЕРИЙ|Признак для оценки
ПРИНЦИП|Основное правило
АНАЛИЗ|Разложение целого на части
СИНТЕЗ|Соединение частей в целое
ДЕДУКЦИЯ|Вывод от общего к частному
ИНДУКЦИЯ|Вывод от частного к общему
ПАРАДОКС|Странное, нелогичное утверждение
ИНТУИЦИЯ|Чутьё без рассуждений
ЛОГИКА|Наука о правильном мышлении
ЭТИКА|Учение о морали
ЭСТЕТИКА|Учение о красоте
`;

const TITLES = [
  "Эрудит", "Логика", "Вершина", "Горизонт", "Орбита", "Кристалл", "Компас", "Меридиан", "Атлас",
  "Хроника", "Рукопись", "Мозаика", "Палитра", "Симфония", "Аккорд", "Мелодия", "Партитура",
  "Резонанс", "Импульс", "Динамика", "Статика", "Оптика", "Квант", "Плазма", "Галактика",
  "Туманность", "Созвездие", "Эклиптика", "Архипелаг", "Континент", "Экватор", "Полюс",
  "Атмосфера", "Стратосфера", "Ионосфера", "Гравитация", "Траектория", "Парабола", "Гипербола",
  "Эллипс", "Синусоида", "Логарифм", "Квадрат", "Гипотенуза", "Катет", "Диагональ", "Радиан",
  "Азимут", "Вертикаль", "Абрис",
];

const SUBTITLES = [
  "Проверьте эрудицию",
  "Слова посложнее",
  "Для начитанных",
  "Классика жанра",
  "Разминка для ума",
  "Тренировка памяти",
  "Тайны и открытия",
  "Наука и природа",
  "Вокруг света",
  "Из глубины веков",
  "Проверка знаний",
  "Умный досуг",
];

const PUZZLE_COUNT = 50;
const SIZES = [
  [9, 9], [9, 10], [10, 10], [10, 11], [11, 11], [11, 12], [12, 12], [12, 13], [13, 13],
];

const BANK = BANK_TEXT.trim().split("\n").map((line) => {
  const bar = line.indexOf("|");
  return { answer: line.slice(0, bar).trim(), clue: line.slice(bar + 1).trim() };
});

function assertBank() {
  const seen = new Set();
  for (const { answer, clue } of BANK) {
    if (!/^[А-Я]+$/.test(answer)) throw new Error(`bad answer: ${answer}`);
    if (seen.has(answer)) throw new Error(`duplicate answer: ${answer}`);
    if (!clue) throw new Error(`missing clue: ${answer}`);
    seen.add(answer);
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const BY_LETTER = (() => {
  const map = new Map();
  for (const { answer } of BANK) {
    for (const letter of new Set(answer)) {
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter).push(answer);
    }
  }
  return map;
})();

function attempt(rng, rows, cols, target) {
  const W = cols;
  const H = rows;
  const grid = new Map();
  const placed = [];
  const used = new Set();
  const excluded = new Set(shuffle(BANK, rng).slice(0, Math.floor(BANK.length * 0.3)).map((w) => w.answer));

  const key = (r, c) => r * W + c;
  const get = (r, c) => (r < 0 || c < 0 || r >= H || c >= W ? undefined : grid.get(key(r, c)));

  function valid(word, r, c, dir) {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    const n = word.length;
    const er = r + dr * (n - 1);
    const ec = c + dc * (n - 1);
    if (r < 0 || c < 0 || er >= H || ec >= W) return -1;
    if (get(r - dr, c - dc)) return -1;
    if (get(er + dr, ec + dc)) return -1;
    let crossings = 0;
    for (let i = 0; i < n; i += 1) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const existing = get(rr, cc);
      if (existing) {
        if (existing !== word[i]) return -1;
        crossings += 1;
      } else if (dir === "across") {
        if (get(rr - 1, cc) || get(rr + 1, cc)) return -1;
      } else if (get(rr, cc - 1) || get(rr, cc + 1)) return -1;
    }
    return crossings;
  }

  function place(word, r, c, dir) {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    for (let i = 0; i < word.length; i += 1) grid.set(key(r + dr * i, c + dc * i), word[i]);
    placed.push({ word, r, c, dir });
    used.add(word);
  }

  const maxLen = Math.max(rows, cols);
  const starters = shuffle(
    BANK.map((w) => w.answer).filter((w) => w.length >= 6 && w.length <= maxLen && !excluded.has(w)),
    rng,
  );
  if (starters.length === 0) return [];
  const first = starters[0];
  const sr = Math.floor(H / 2);
  const sc = Math.floor((W - first.length) / 2);
  place(first, sr, sc, "across");

  while (placed.length < target) {
    const options = [];
    const seen = new Set();
    for (const idx of grid.keys()) {
      const r = Math.floor(idx / W);
      const c = idx % W;
      const ch = grid.get(idx);
      for (const word of BY_LETTER.get(ch) ?? []) {
        if (used.has(word) || excluded.has(word) || word.length > maxLen) continue;
        for (let i = 0; i < word.length; i += 1) {
          if (word[i] !== ch) continue;
          for (const dir of ["across", "down"]) {
            const rr = dir === "down" ? r - i : r;
            const cc = dir === "across" ? c - i : c;
            const signature = `${word}@${rr},${cc},${dir}`;
            if (seen.has(signature)) continue;
            seen.add(signature);
            const crossings = valid(word, rr, cc, dir);
            if (crossings > 0) options.push({ word, r: rr, c: cc, dir, crossings, jitter: rng() });
          }
        }
      }
    }
    if (options.length === 0) break;
    options.sort(
      (a, b) => b.crossings - a.crossings || b.word.length - a.word.length || b.jitter - a.jitter,
    );
    const pick = options[Math.floor(rng() * Math.min(4, options.length))];
    place(pick.word, pick.r, pick.c, pick.dir);
  }
  return placed;
}

function bounds(placed) {
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const p of placed) {
    const dr = p.dir === "down" ? 1 : 0;
    const dc = p.dir === "across" ? 1 : 0;
    for (let i = 0; i < p.word.length; i += 1) {
      minR = Math.min(minR, p.r + dr * i);
      maxR = Math.max(maxR, p.r + dr * i);
      minC = Math.min(minC, p.c + dc * i);
      maxC = Math.max(maxC, p.c + dc * i);
    }
  }
  return { minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

function score(placed) {
  const b = bounds(placed);
  return placed.length * 1000 - b.rows * b.cols * 1.5 - Math.abs(b.rows - b.cols) * 12;
}

function generatePuzzle(rng, rows, cols, target) {
  let best = null;
  for (let i = 0; i < 30; i += 1) {
    const placed = attempt(rng, rows, cols, target);
    if (placed.length < 8) continue;
    const value = score(placed);
    if (!best || value > best.value) best = { placed, value };
    if (best.placed.length >= target) break;
  }
  return best?.placed ?? null;
}

function difficultyFor(words, rows, cols) {
  const span = Math.max(rows, cols);
  if (words >= 13 || span >= 13) return "hard";
  return "medium";
}

function tsString(value) {
  return JSON.stringify(value);
}

function renderWordbank() {
  const lines = [
    "// GENERATED by scripts/generate-crosswords.mjs. Do not edit by hand.",
    "// Harder Russian answer pool: answer -> clue.",
    "export const WORD_BANK: Record<string, string> = {",
  ];
  for (const { answer, clue } of BANK) lines.push(`  ${tsString(answer)}: ${tsString(clue)},`);
  lines.push("};", "");
  return lines.join("\n");
}

function renderPuzzles(puzzles) {
  const lines = [
    'import { WORD_BANK } from "./wordbank";',
    'import type { CrosswordPuzzle, Direction, PuzzleEntry } from "./types";',
    "",
    "// GENERATED by scripts/generate-crosswords.mjs. Do not edit by hand.",
    "const entry = (answer: string, row: number, col: number, dir: Direction): PuzzleEntry => {",
    "  const clue = WORD_BANK[answer];",
    "  if (!clue) throw new Error(`No clue for ${answer}`);",
    "  return { answer, clue, row, col, dir };",
    "};",
    "",
    "export const CROSSWORD_PUZZLES: CrosswordPuzzle[] = [",
  ];
  for (const puzzle of puzzles) {
    lines.push("  {");
    lines.push(`    id: ${tsString(puzzle.id)},`);
    lines.push(`    title: ${tsString(puzzle.title)},`);
    lines.push(`    subtitle: ${tsString(puzzle.subtitle)},`);
    lines.push(`    difficulty: ${tsString(puzzle.difficulty)},`);
    lines.push(`    rows: ${puzzle.rows},`);
    lines.push(`    cols: ${puzzle.cols},`);
    lines.push("    entries: [");
    for (const e of puzzle.entries) {
      lines.push(`      entry(${tsString(e.answer)}, ${e.row}, ${e.col}, ${tsString(e.dir)}),`);
    }
    lines.push("    ],");
    lines.push("  },");
  }
  lines.push("];", "");
  lines.push("export function getPuzzle(id: string): CrosswordPuzzle | undefined {");
  lines.push("  return CROSSWORD_PUZZLES.find((puzzle) => puzzle.id === id);");
  lines.push("}", "");
  return lines.join("\n");
}

function main() {
  assertBank();
  const rng = mulberry32(0x5eed1234);
  const puzzles = [];
  let guard = 0;
  while (puzzles.length < PUZZLE_COUNT && guard < PUZZLE_COUNT * 400) {
    guard += 1;
    const [rows, cols] = SIZES[Math.floor(rng() * SIZES.length)];
    const target = Math.min(14, Math.max(8, Math.round((rows + cols) / 2)));
    const placed = generatePuzzle(rng, rows, cols, target);
    if (!placed) continue;
    const b = bounds(placed);
    const entries = placed.map((p) => ({
      answer: p.word,
      row: p.r - b.minR,
      col: p.c - b.minC,
      dir: p.dir,
    }));
    puzzles.push({
      id: "",
      title: "",
      subtitle: "",
      difficulty: difficultyFor(placed.length, b.rows, b.cols),
      rows: b.rows,
      cols: b.cols,
      entries,
    });
  }
  puzzles.sort((a, b) => a.rows * a.cols - b.rows * b.cols);
  puzzles.forEach((puzzle, index) => {
    puzzle.id = `cw-${String(index + 1).padStart(2, "0")}`;
    puzzle.title = TITLES[index % TITLES.length];
    puzzle.subtitle = SUBTITLES[index % SUBTITLES.length];
  });

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  mkdirSync(join(root, "src/lib/crossword"), { recursive: true });
  writeFileSync(join(root, "src/lib/crossword/wordbank.ts"), renderWordbank());
  writeFileSync(join(root, "src/lib/crossword/puzzles.ts"), renderPuzzles(puzzles));

  const words = puzzles.map((p) => p.entries.length);
  const reused = new Set(puzzles.flatMap((p) => p.entries.map((e) => e.answer)));
  process.stdout.write(
    [
      `bank: ${BANK.length} words`,
      `puzzles: ${puzzles.length}`,
      `words/puzzle: ${Math.min(...words)}-${Math.max(...words)} (avg ${(words.reduce((a, b) => a + b, 0) / words.length).toFixed(1)})`,
      `unique answers used: ${reused.size}`,
      "",
    ].join("\n"),
  );
}

main();
