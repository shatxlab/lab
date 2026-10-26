import type { AppLang } from "@/lib/apps/lang";
import { BASE } from "./sim/balance";
import type { TowerStats } from "./sim/stats";
import type { PerkId, UpgradeId } from "./sim/types";

export interface Blurb {
  name: string;
  description: string;
}

/** One number a card shows: its label and the value, already formatted. */
export type Stat = [label: string, value: string];

/** What the tower has right now in the stats this upgrade drives. */
export type UpgradeStats = (stats: TowerStats) => Stat[];
/** The total a perk gives at this level; `stats` are the perks' alone, with no upgrades. */
export type PerkStats = (stats: TowerStats, level: number) => Stat[];

/**
 * A card's numbers before and after a level: "Slow 25% → 35% · Lasts 6 s → 9 s".
 * Pass the same stats twice (a new upgrade, a maxed perk) for the values alone.
 */
export function statChange(before: Stat[], after: Stat[]): string {
  return after
    .map(([label, value], index) => {
      const old = before[index]?.[1];
      return old === undefined || old === value ? `${label} ${value}` : `${label} ${old} → ${value}`;
    })
    .join(" · ");
}

function numbers(lang: AppLang) {
  const one = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  return {
    num: (value: number) => one.format(value),
    pct: (value: number) => `${Math.round(value * 100)}%`,
  };
}

const EN = numbers("en");
const RU = numbers("ru");

export interface TowerText {
  title: string;
  tagline: string;
  howTo: string[];
  play: string;
  playAgain: string;
  menu: string;
  home: string;
  perksTitle: string;
  perksHint: string;
  back: string;
  best: (wave: number) => string;
  gold: (amount: number) => string;
  level: (level: number) => string;
  buy: (cost: number) => string;
  maxed: string;
  wave: (wave: number) => string;
  bossWave: string;
  wall: string;
  volleyReady: string;
  volleyCharging: string;
  pause: string;
  paused: string;
  resume: string;
  giveUp: string;
  waveCleared: (wave: number) => string;
  headStart: string;
  chooseUpgrade: string;
  levelUp: (from: number, to: number) => string;
  fallen: string;
  retreated: string;
  reached: (wave: number) => string;
  newBest: string;
  kills: (kills: number) => string;
  goldEarned: (amount: number) => string;
  fieldLabel: string;
  upgrades: Record<UpgradeId, Blurb>;
  upgradeStats: Record<UpgradeId, UpgradeStats>;
  perks: Record<PerkId, Blurb>;
  perkStats: Record<PerkId, PerkStats>;
}

export const TOWER_TEXT: Record<AppLang, TowerText> = {
  en: {
    title: "Lone Tower",
    tagline: "One archer on the castle tower, and the woods full of enemies. Aim, shoot, hold the wall as long as you can.",
    howTo: [
      "Hold a finger on the field and your archer shoots that way.",
      "Double-tap the field to rain a volley of arrows there.",
      "After each wave, pick one of three upgrades.",
      "Gold from every run buys perks that last.",
    ],
    play: "Play",
    playAgain: "Play again",
    menu: "Menu",
    home: "Home",
    perksTitle: "Perks",
    perksHint: "Bought with gold, kept for every run.",
    back: "Back",
    best: (wave) => (wave > 0 ? `Best: wave ${wave}` : "No runs yet"),
    gold: (amount) => `${amount} gold`,
    level: (level) => `Lv ${level}`,
    buy: (cost) => `Buy · ${cost}`,
    maxed: "Max",
    wave: (wave) => `Wave ${wave}`,
    bossWave: "Boss",
    wall: "Wall",
    volleyReady: "Volley ready: double-tap the field",
    volleyCharging: "Volley reloading",
    pause: "Pause",
    paused: "Paused",
    resume: "Resume",
    giveUp: "Give up",
    waveCleared: (wave) => `Wave ${wave} cleared`,
    headStart: "Head start",
    chooseUpgrade: "Choose an upgrade",
    levelUp: (from, to) => (from === 0 ? "New" : `Lv ${from} → ${to}`),
    fallen: "The tower fell",
    retreated: "You left the tower",
    reached: (wave) => `You reached wave ${wave}`,
    newBest: "New best!",
    kills: (kills) => `${kills} enemies down`,
    goldEarned: (amount) => `+${amount} gold`,
    fieldLabel: "Battlefield. Hold to shoot that way, double-tap to drop a volley there; Space drops a volley on the nearest enemy.",
    upgrades: {
      damage: { name: "Sharper tips", description: "+25% damage." },
      reload: { name: "Quick hands", description: "Shoot 12% faster." },
      multishot: { name: "Multishot", description: "+1 arrow with every shot." },
      pierce: { name: "Piercing", description: "Arrows go through one more enemy." },
      ricochet: { name: "Ricochet", description: "Arrows bounce on to one more enemy." },
      crit: { name: "Eagle eye", description: "+10% chance of double damage." },
      range: { name: "Longbow", description: "Shoot further." },
      fire: { name: "Fire arrows", description: "Hits set enemies burning for 3 s." },
      frost: { name: "Frost arrows", description: "Hits slow enemies for 1.5 s; each level slows them 15% more." },
      wall: { name: "Stone wall", description: "+30 wall HP, repaired right away." },
      regen: { name: "Masons", description: "The wall repairs 1 HP every second." },
      volleySize: { name: "Bigger volley", description: "+5 arrows over a wider area." },
      volleyCooldown: { name: "Faster volley", description: "The volley reloads 1.2 s sooner." },
      caltrops: {
        name: "Caltrops",
        description:
          "Arrows that miss stay in the ground and slow anyone walking over them. Each level slows more and keeps them there longer. Bats fly over; with frost, the stronger slow counts.",
      },
    },
    upgradeStats: {
      damage: (s) => [["Damage", EN.num(s.damage)]],
      reload: (s) => [["Shots a second", EN.num(1 / s.reload)]],
      multishot: (s) => [["Arrows a shot", `${s.multishot}`]],
      pierce: (s) => [["Enemies an arrow", `${1 + s.pierce}`]],
      ricochet: (s) => [["Bounces", `${s.ricochet}`]],
      crit: (s) => [["Double damage", EN.pct(s.critChance)]],
      range: (s) => [["Range", EN.num(s.range)]],
      fire: (s) => [["Burn", `${EN.num(s.burnDps)} a second`]],
      frost: (s) => [["Slow", EN.pct(s.frost)]],
      wall: (s) => [["Wall", `${EN.num(s.maxHp)} HP`]],
      regen: (s) => [["Repairs", `${s.regen} HP a second`]],
      volleySize: (s) => [
        ["Arrows", `${s.volleyArrows}`],
        ["Area", EN.num(s.volleyRadius)],
      ],
      volleyCooldown: (s) => [["Reload", `${EN.num(s.volleyCooldown)} s`]],
      caltrops: (s) => [
        ["Slow", EN.pct(s.caltropSlow)],
        ["Lasts", `${s.caltropLife} s`],
      ],
    },
    perks: {
      fortify: { name: "Fortify", description: "+15 wall HP." },
      fletching: { name: "Fletching", description: "+8% damage." },
      quickDraw: { name: "Drill", description: "Shoot 5% faster." },
      tactics: { name: "Tactics", description: "The volley reloads 0.5 s sooner." },
      headStart: { name: "Head start", description: "A free upgrade before wave 1." },
    },
    perkStats: {
      fortify: (s) => [["Wall", `+${EN.num(s.maxHp - BASE.maxHp)} HP`]],
      fletching: (s) => [["Damage", `+${EN.pct(s.damage / BASE.damage - 1)}`]],
      quickDraw: (s) => [["Shooting speed", `+${EN.pct(BASE.reload / s.reload - 1)}`]],
      tactics: (s) => [["Volley reload", `−${EN.num(BASE.volleyCooldown - s.volleyCooldown)} s`]],
      headStart: (_s, level) => [["Free upgrades", `${level}`]],
    },
  },
  ru: {
    title: "Одинокая башня",
    tagline: "Один лучник на башне замка, а лес полон врагов. Цельтесь, стреляйте и держите стену сколько сможете.",
    howTo: [
      "Держите палец на поле, и лучник стреляет в ту сторону.",
      "Дважды коснитесь поля, чтобы обрушить туда залп стрел.",
      "После каждой волны выберите одно из трёх улучшений.",
      "Золото из каждого забега тратится на постоянные бонусы.",
    ],
    play: "Играть",
    playAgain: "Ещё раз",
    menu: "Меню",
    home: "На главную",
    perksTitle: "Бонусы",
    perksHint: "Покупаются за золото и действуют в каждом забеге.",
    back: "Назад",
    best: (wave) => (wave > 0 ? `Рекорд: волна ${wave}` : "Забегов ещё не было"),
    gold: (amount) => `${amount} золота`,
    level: (level) => `Ур. ${level}`,
    buy: (cost) => `Купить · ${cost}`,
    maxed: "Макс.",
    wave: (wave) => `Волна ${wave}`,
    bossWave: "Босс",
    wall: "Стена",
    volleyReady: "Залп готов: коснитесь поля дважды",
    volleyCharging: "Залп перезаряжается",
    pause: "Пауза",
    paused: "Пауза",
    resume: "Продолжить",
    giveUp: "Сдаться",
    waveCleared: (wave) => `Волна ${wave} пройдена`,
    headStart: "Фора",
    chooseUpgrade: "Выберите улучшение",
    levelUp: (from, to) => (from === 0 ? "Новое" : `Ур. ${from} → ${to}`),
    fallen: "Башня пала",
    retreated: "Вы оставили башню",
    reached: (wave) => `Вы дошли до волны ${wave}`,
    newBest: "Новый рекорд!",
    kills: (kills) => `Побеждено врагов: ${kills}`,
    goldEarned: (amount) => `+${amount} золота`,
    fieldLabel: "Поле боя. Удерживайте, чтобы стрелять в ту сторону, коснитесь дважды, чтобы обрушить туда залп; пробел обрушивает залп на ближайшего врага.",
    upgrades: {
      damage: { name: "Острые наконечники", description: "+25% урона." },
      reload: { name: "Быстрые руки", description: "Стрельба на 12% быстрее." },
      multishot: { name: "Мультивыстрел", description: "+1 стрела за выстрел." },
      pierce: { name: "Пробивание", description: "Стрела пробивает ещё одного врага." },
      ricochet: { name: "Рикошет", description: "Стрела отскакивает ещё в одного врага." },
      crit: { name: "Орлиный глаз", description: "+10% шанса на двойной урон." },
      range: { name: "Длинный лук", description: "Стрельба дальше." },
      fire: { name: "Огненные стрелы", description: "Попадания поджигают врагов на 3 с." },
      frost: { name: "Ледяные стрелы", description: "Попадания замедляют врагов на 1,5 с; каждый уровень — ещё на 15% сильнее." },
      wall: { name: "Каменная стена", description: "+30 к прочности стены, сразу восстанавливается." },
      regen: { name: "Каменщики", description: "Стена чинится на 1 в секунду." },
      volleySize: { name: "Большой залп", description: "+5 стрел, шире область." },
      volleyCooldown: { name: "Быстрый залп", description: "Залп перезаряжается на 1,2 с быстрее." },
      caltrops: {
        name: "Шипы",
        description:
          "Промахнувшиеся стрелы остаются в земле и замедляют пеших врагов. С каждым уровнем замедляют сильнее и держатся дольше. Летучие мыши пролетают над ними; вместе со льдом действует более сильное замедление.",
      },
    },
    upgradeStats: {
      damage: (s) => [["Урон", RU.num(s.damage)]],
      reload: (s) => [["Выстрелов в секунду", RU.num(1 / s.reload)]],
      multishot: (s) => [["Стрел за выстрел", `${s.multishot}`]],
      pierce: (s) => [["Врагов на стрелу", `${1 + s.pierce}`]],
      ricochet: (s) => [["Отскоков", `${s.ricochet}`]],
      crit: (s) => [["Двойной урон", RU.pct(s.critChance)]],
      range: (s) => [["Дальность", RU.num(s.range)]],
      fire: (s) => [["Горение", `${RU.num(s.burnDps)} в секунду`]],
      frost: (s) => [["Замедление", RU.pct(s.frost)]],
      wall: (s) => [["Стена", RU.num(s.maxHp)]],
      regen: (s) => [["Ремонт", `${s.regen} в секунду`]],
      volleySize: (s) => [
        ["Стрел", `${s.volleyArrows}`],
        ["Радиус", RU.num(s.volleyRadius)],
      ],
      volleyCooldown: (s) => [["Перезарядка", `${RU.num(s.volleyCooldown)} с`]],
      caltrops: (s) => [
        ["Замедление", RU.pct(s.caltropSlow)],
        ["Держатся", `${s.caltropLife} с`],
      ],
    },
    perks: {
      fortify: { name: "Укрепление", description: "+15 к прочности стены." },
      fletching: { name: "Оперение", description: "+8% урона." },
      quickDraw: { name: "Выучка", description: "Стрельба на 5% быстрее." },
      tactics: { name: "Тактика", description: "Залп перезаряжается на 0,5 с быстрее." },
      headStart: { name: "Фора", description: "Бесплатное улучшение перед первой волной." },
    },
    perkStats: {
      fortify: (s) => [["Стена", `+${RU.num(s.maxHp - BASE.maxHp)}`]],
      fletching: (s) => [["Урон", `+${RU.pct(s.damage / BASE.damage - 1)}`]],
      quickDraw: (s) => [["Скорость стрельбы", `+${RU.pct(BASE.reload / s.reload - 1)}`]],
      tactics: (s) => [["Перезарядка залпа", `−${RU.num(BASE.volleyCooldown - s.volleyCooldown)} с`]],
      headStart: (_s, level) => [["Бесплатных улучшений", `${level}`]],
    },
  },
};
