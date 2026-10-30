import type { AppLang } from "@/lib/apps/lang";
import type { Blurb, Stat } from "@/lib/tower/i18n";
import { BURN, MARK, type TowerLevel } from "./sim/balance";
import type { ArcherBranch, CanvasId, MapId, TowerKind } from "./sim/types";

/** What one level of a tower does, as a card shows it. */
export type LevelStats = (level: TowerLevel & { burn?: number; mark?: number }) => Stat[];

function numbers(lang: AppLang) {
  const one = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  return {
    num: (value: number) => one.format(value),
    pct: (value: number) => `${Math.round(value * 100)}%`,
  };
}

const EN = numbers("en");
const RU = numbers("ru");

export interface KingsroadText {
  title: string;
  tagline: string;
  howTo: string[];
  home: string;
  chooseRoad: string;
  /** The setting each run of ten maps is played in, as a menu heading. */
  canvases: Record<CanvasId, string>;
  maps: Record<MapId, Blurb>;
  waves: (count: number) => string;
  locked: string;
  starsLabel: (stars: number) => string;
  wave: (wave: number, total: number) => string;
  bossWave: string;
  lives: (lives: number) => string;
  gold: (amount: number) => string;
  speed: string;
  pause: string;
  paused: string;
  resume: string;
  giveUp: string;
  startWave: string;
  nextWave: (seconds: number, bonus: number) => string;
  marching: string;
  lastWave: string;
  volleyReady: string;
  volleyCharging: string;
  volleyAiming: string;
  buildHere: string;
  build: (cost: number) => string;
  upgrade: (cost: number) => string;
  topLevel: string;
  /** The archer's fork: what to call each pick and what it does. */
  branches: Record<ArcherBranch, Blurb>;
  chooseArrows: string;
  sell: (refund: number) => string;
  close: string;
  level: (level: number) => string;
  towers: Record<TowerKind, Blurb>;
  levelStats: Record<TowerKind, LevelStats>;
  won: string;
  lost: string;
  wavesHeld: (wave: number, total: number) => string;
  livesLeft: (lives: number) => string;
  kills: (kills: number) => string;
  newBest: string;
  playAgain: string;
  nextRoad: string;
  menu: string;
  fieldLabel: string;
}

export const KINGSROAD_TEXT: Record<AppLang, KingsroadText> = {
  en: {
    title: "Kingsroad",
    tagline: "The horde is marching down the king's road. Build towers along it and keep them out of the gate.",
    howTo: [
      "Tap a plot beside the road to build a tower on it.",
      "Tap a tower to upgrade it or sell it.",
      "Call the next wave early for extra gold.",
      "Bats fly straight at the gate: keep archers or frost near it.",
    ],
    home: "Home",
    chooseRoad: "Choose a road",
    canvases: { meadow: "The Meadow", autumn: "The Amber Woods" },
    maps: {
      meadow: { name: "The Meadow", description: "A long road winding across the fields. A gentle start." },
      ford: { name: "Long Ford", description: "Two long diagonals and less time to stop them." },
      crossroads: { name: "Crossroads", description: "Two roads out of the woods, meeting halfway to the gate." },
      switchback: { name: "Switchback", description: "Five long lanes back and forth across the field." },
      rivers: { name: "Twin Rivers", description: "Two roads that keep apart all the way to the gate." },
      serpent: { name: "The Serpent", description: "One road with nine bends. Mind the bats." },
      saltire: { name: "Saltire", description: "Two roads cross in the middle and swap sides." },
      gorge: { name: "The Gorge", description: "A narrow road wandering from wall to wall." },
      trident: { name: "The Trident", description: "Three roads out of the woods, then one road home." },
      citadel: { name: "Last Stand", description: "Three roads, one a long way round. The warlord is waiting." },
      harvest: { name: "Harvest Lane", description: "A spiral road down the amber woods. Knights wear plate: small arrows barely scratch them." },
      orchards: { name: "Twin Orchards", description: "Two roads either side of the orchard, and scamps swarming down both." },
      hairpin: { name: "Hairpin Hill", description: "Tight bends from edge to edge. Imps don't burn: save the fire arrows." },
      crows: { name: "Crow's Crossing", description: "Two roads cross and a third runs straight down the middle. Healers walk with the column." },
      detour: { name: "The Detour", description: "A road straight to the gate and another the long way round. Gargoyles fly over both." },
      parting: { name: "Parting of Ways", description: "One road splits in two and meets again at the gate." },
      winding: { name: "The Winding Walk", description: "One road winds the whole field; another hugs the edge and cuts in late." },
      gauntlet: { name: "The Gauntlet", description: "Long straights from wall to wall." },
      kings: { name: "Three Kings", description: "Three roads: the outer two run straight, the middle one twists." },
      watch: { name: "The Long Watch", description: "Three roads, one straight and fast. The winter warlord waits." },
    },
    waves: (count) => `${count} waves`,
    locked: "Win the road before to open this one",
    starsLabel: (stars) => (stars === 0 ? "Not won yet" : `${stars} of 3 stars`),
    wave: (wave, total) => `Wave ${wave}/${total}`,
    bossWave: "Boss",
    lives: (lives) => `${lives} lives`,
    gold: (amount) => `${amount} gold`,
    speed: "Game speed",
    pause: "Pause",
    paused: "Paused",
    resume: "Resume",
    giveUp: "Give up",
    startWave: "Start wave 1",
    nextWave: (seconds, bonus) => `Next wave in ${seconds} s · call now +${bonus}`,
    marching: "The wave is marching",
    lastWave: "Last wave",
    volleyReady: "Volley",
    volleyCharging: "Volley reloading",
    volleyAiming: "Tap the field to loose it",
    buildHere: "Build here",
    build: (cost) => `Build · ${cost}`,
    upgrade: (cost) => `Upgrade · ${cost}`,
    topLevel: "Top level",
    branches: {
      fire: { name: "Fire arrows", description: "Sets the enemy alight; it keeps burning after the hit." },
      lune: { name: "Lune arrows", description: "Marks the enemy: every tower's hits on it do more damage." },
    },
    chooseArrows: "Choose its arrows",
    sell: (refund) => `Sell · +${refund}`,
    close: "Close",
    level: (level) => `Lv ${level}`,
    towers: {
      archer: { name: "Archers", description: "Quick arrows at one enemy at a time. Hits bats." },
      catapult: { name: "Catapult", description: "Stones that crush a whole column. Can't hit bats." },
      frost: { name: "Frost mage", description: "Slows whatever it hits and everything close by. Hits bats." },
      ballista: { name: "Ballista", description: "The longest reach; each bolt goes through everything in its line." },
    },
    levelStats: {
      archer: (level) => [
        ...statsEn(level),
        ...(level.burn ? [["Burn", `${EN.num(BURN.dps)}/s · ${EN.num(level.burn)} s`] as Stat] : []),
        ...(level.mark ? [["Mark", `+${EN.pct(MARK.bonus)} · ${EN.num(level.mark)} s`] as Stat] : []),
      ],
      catapult: (level) => [...statsEn(level), ["Area", EN.num(level.splash)]],
      frost: (level) => [...statsEn(level), ["Slow", EN.pct(level.slow)]],
      ballista: (level) => statsEn(level),
    },
    won: "The gate held!",
    lost: "The gate fell",
    wavesHeld: (wave, total) => `Waves held: ${wave} of ${total}`,
    livesLeft: (lives) => `${lives} lives left`,
    kills: (kills) => `${kills} enemies down`,
    newBest: "New best!",
    playAgain: "Play again",
    nextRoad: "Next road",
    menu: "Menu",
    fieldLabel:
      "The road and its build plots. Tap a plot to build, tap a tower to upgrade or sell. Arrow keys move between plots, Space drops the volley on the enemy nearest the gate, N calls the next wave.",
  },
  ru: {
    title: "Королевский тракт",
    tagline: "Орда идёт по королевскому тракту. Стройте башни вдоль дороги и не пустите врагов в ворота.",
    howTo: [
      "Коснитесь площадки у дороги, чтобы построить на ней башню.",
      "Коснитесь башни, чтобы улучшить или продать её.",
      "Вызовите следующую волну раньше — получите золото.",
      "Летучие мыши летят прямо к воротам: держите рядом лучников или мага.",
    ],
    home: "На главную",
    chooseRoad: "Выберите дорогу",
    canvases: { meadow: "Луг", autumn: "Янтарный лес" },
    maps: {
      meadow: { name: "Луг", description: "Длинная дорога петляет по полям. Спокойное начало." },
      ford: { name: "Долгий брод", description: "Две длинные диагонали и меньше времени, чтобы остановить врагов." },
      crossroads: { name: "Перекрёсток", description: "Две дороги из леса сходятся на полпути к воротам." },
      switchback: { name: "Серпантин", description: "Пять длинных отрезков дороги туда и обратно через поле." },
      rivers: { name: "Две реки", description: "Две дороги, которые не сходятся до самых ворот." },
      serpent: { name: "Змея", description: "Одна дорога с девятью поворотами. Берегитесь летучих мышей." },
      saltire: { name: "Косой крест", description: "Две дороги пересекаются посередине и меняются сторонами." },
      gorge: { name: "Ущелье", description: "Узкая дорога петляет от стены к стене." },
      trident: { name: "Трезубец", description: "Три дороги из леса, а к воротам — одна." },
      citadel: { name: "Последний рубеж", description: "Три дороги, одна из них — в обход. Полководец ждёт." },
      harvest: { name: "Урожайная тропа", description: "Дорога-спираль по янтарному лесу. Рыцари в латах: мелкие стрелы их едва царапают." },
      orchards: { name: "Два сада", description: "Две дороги по обе стороны сада, и по обеим бежит рой бесят." },
      hairpin: { name: "Шпильки", description: "Крутые повороты от края до края. Бесы не горят: берегите огненные стрелы." },
      crows: { name: "Воронье перекрёстье", description: "Две дороги пересекаются, третья идёт прямо посередине. Лекари идут в колонне." },
      detour: { name: "Окружной путь", description: "Одна дорога прямо к воротам, другая — в обход. Горгульи летят над обеими." },
      parting: { name: "Развилка", description: "Одна дорога делится надвое и сходится у ворот." },
      winding: { name: "Извилистая тропа", description: "Одна дорога вьётся по всему полю, другая жмётся к краю и выходит поздно." },
      gauntlet: { name: "Строй", description: "Длинные прямые от стены до стены." },
      kings: { name: "Три короля", description: "Три дороги: две крайние прямые, средняя извивается." },
      watch: { name: "Долгий дозор", description: "Три дороги, одна прямая и быстрая. Зимний полководец ждёт." },
    },
    waves: (count) => `${count} ${plural(count, "волна", "волны", "волн")}`,
    locked: "Откроется после победы на предыдущей дороге",
    starsLabel: (stars) => (stars === 0 ? "Ещё не пройдена" : `${stars} из 3 звёзд`),
    wave: (wave, total) => `Волна ${wave}/${total}`,
    bossWave: "Босс",
    lives: (lives) => `${lives} ${plural(lives, "жизнь", "жизни", "жизней")}`,
    gold: (amount) => `${amount} золота`,
    speed: "Скорость игры",
    pause: "Пауза",
    paused: "Пауза",
    resume: "Продолжить",
    giveUp: "Сдаться",
    startWave: "Начать первую волну",
    nextWave: (seconds, bonus) => `Волна через ${seconds} с · сейчас +${bonus}`,
    marching: "Волна идёт",
    lastWave: "Последняя волна",
    volleyReady: "Залп",
    volleyCharging: "Залп перезаряжается",
    volleyAiming: "Коснитесь поля, куда стрелять",
    buildHere: "Строить здесь",
    build: (cost) => `Построить · ${cost}`,
    upgrade: (cost) => `Улучшить · ${cost}`,
    topLevel: "Высший уровень",
    branches: {
      fire: { name: "Огненные стрелы", description: "Поджигает врага: он горит и после попадания." },
      lune: { name: "Лунные стрелы", description: "Метит врага: попадания любых башен по нему сильнее." },
    },
    chooseArrows: "Выберите стрелы",
    sell: (refund) => `Продать · +${refund}`,
    close: "Закрыть",
    level: (level) => `Ур. ${level}`,
    towers: {
      archer: { name: "Лучники", description: "Быстрые стрелы по одному врагу. Бьют и летучих мышей." },
      catapult: { name: "Катапульта", description: "Камни, сминающие целую колонну. Летучих мышей не достаёт." },
      frost: { name: "Ледяной маг", description: "Замедляет цель и всех рядом с ней. Бьёт и летучих мышей." },
      ballista: { name: "Баллиста", description: "Самая дальняя; каждый болт пробивает всех на своём пути." },
    },
    levelStats: {
      archer: (level) => [
        ...statsRu(level),
        ...(level.burn ? [["Горение", `${RU.num(BURN.dps)}/с · ${RU.num(level.burn)} с`] as Stat] : []),
        ...(level.mark ? [["Метка", `+${RU.pct(MARK.bonus)} · ${RU.num(level.mark)} с`] as Stat] : []),
      ],
      catapult: (level) => [...statsRu(level), ["Область", RU.num(level.splash)]],
      frost: (level) => [...statsRu(level), ["Замедление", RU.pct(level.slow)]],
      ballista: (level) => statsRu(level),
    },
    won: "Ворота выстояли!",
    lost: "Ворота пали",
    wavesHeld: (wave, total) => `Отбито волн: ${wave} из ${total}`,
    livesLeft: (lives) => `Осталось ${lives} ${plural(lives, "жизнь", "жизни", "жизней")}`,
    kills: (kills) => `Повержено врагов: ${kills}`,
    newBest: "Новый рекорд!",
    playAgain: "Ещё раз",
    nextRoad: "Следующая дорога",
    menu: "Меню",
    fieldLabel:
      "Дорога и площадки для башен. Коснитесь площадки, чтобы строить, или башни, чтобы улучшить или продать. Стрелки переключают площадки, пробел даёт залп по врагу ближе всех к воротам, N вызывает следующую волну.",
  },
};

function statsEn(level: TowerLevel): Stat[] {
  return [
    ["Damage", EN.num(level.damage)],
    ["Every", `${EN.num(level.reload)} s`],
    ["Range", EN.num(level.range)],
  ];
}

function statsRu(level: TowerLevel): Stat[] {
  return [
    ["Урон", RU.num(level.damage)],
    ["Раз в", `${RU.num(level.reload)} с`],
    ["Дальность", RU.num(level.range)],
  ];
}

/** Russian noun form for a count: 1 волна, 2 волны, 5 волн. */
function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}
