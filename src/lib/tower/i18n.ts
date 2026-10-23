import type { AppLang } from "@/lib/apps/lang";
import type { PerkId, UpgradeId } from "./sim/types";

export interface Blurb {
  name: string;
  description: string;
}

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
  volley: string;
  volleyArmed: string;
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
  perks: Record<PerkId, Blurb>;
}

export const TOWER_TEXT: Record<AppLang, TowerText> = {
  en: {
    title: "Lone Tower",
    tagline: "One archer on the castle tower, and the woods full of enemies. Aim, shoot, hold the wall as long as you can.",
    howTo: [
      "Hold a finger on the field and your archer shoots that way.",
      "Tap Volley, then tap the field to rain arrows there.",
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
    volley: "Volley",
    volleyArmed: "Tap the field to drop it",
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
    fieldLabel: "Battlefield. Hold to shoot that way; Space drops a volley on the nearest enemy.",
    upgrades: {
      damage: { name: "Sharper tips", description: "+25% damage." },
      reload: { name: "Quick hands", description: "Shoot 12% faster." },
      multishot: { name: "Multishot", description: "+1 arrow with every shot." },
      pierce: { name: "Piercing", description: "Arrows go through one more enemy." },
      ricochet: { name: "Ricochet", description: "Arrows bounce on to one more enemy." },
      crit: { name: "Eagle eye", description: "+10% chance of double damage." },
      range: { name: "Longbow", description: "Shoot further." },
      fire: { name: "Fire arrows", description: "Hits set enemies burning for 3 s." },
      frost: { name: "Frost arrows", description: "Hits slow enemies by 15% more." },
      wall: { name: "Stone wall", description: "+30 wall HP, repaired right away." },
      regen: { name: "Masons", description: "The wall repairs 1 HP every second." },
      volleySize: { name: "Bigger volley", description: "+5 arrows over a wider area." },
      volleyCooldown: { name: "Faster volley", description: "The volley reloads 1.2 s sooner." },
      caltrops: { name: "Caltrops", description: "Arrows that miss stay in the ground and slow anyone walking over them." },
    },
    perks: {
      fortify: { name: "Fortify", description: "+15 wall HP." },
      fletching: { name: "Fletching", description: "+8% damage." },
      tactics: { name: "Tactics", description: "The volley reloads 0.5 s sooner." },
      headStart: { name: "Head start", description: "A free upgrade before wave 1." },
    },
  },
  ru: {
    title: "Одинокая башня",
    tagline: "Один лучник на башне замка, а лес полон врагов. Цельтесь, стреляйте и держите стену сколько сможете.",
    howTo: [
      "Держите палец на поле, и лучник стреляет в ту сторону.",
      "Нажмите «Залп», затем коснитесь поля, чтобы обрушить туда стрелы.",
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
    volley: "Залп",
    volleyArmed: "Коснитесь поля, куда его обрушить",
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
    fieldLabel: "Поле боя. Удерживайте, чтобы стрелять в ту сторону; пробел обрушивает залп на ближайшего врага.",
    upgrades: {
      damage: { name: "Острые наконечники", description: "+25% урона." },
      reload: { name: "Быстрые руки", description: "Стрельба на 12% быстрее." },
      multishot: { name: "Мультивыстрел", description: "+1 стрела за выстрел." },
      pierce: { name: "Пробивание", description: "Стрела пробивает ещё одного врага." },
      ricochet: { name: "Рикошет", description: "Стрела отскакивает ещё в одного врага." },
      crit: { name: "Орлиный глаз", description: "+10% шанса на двойной урон." },
      range: { name: "Длинный лук", description: "Стрельба дальше." },
      fire: { name: "Огненные стрелы", description: "Попадания поджигают врагов на 3 с." },
      frost: { name: "Ледяные стрелы", description: "Попадания замедляют врагов ещё на 15%." },
      wall: { name: "Каменная стена", description: "+30 к прочности стены, сразу восстанавливается." },
      regen: { name: "Каменщики", description: "Стена чинится на 1 в секунду." },
      volleySize: { name: "Большой залп", description: "+5 стрел, шире область." },
      volleyCooldown: { name: "Быстрый залп", description: "Залп перезаряжается на 1,2 с быстрее." },
      caltrops: { name: "Шипы", description: "Промахнувшиеся стрелы остаются в земле и замедляют пеших врагов." },
    },
    perks: {
      fortify: { name: "Укрепление", description: "+15 к прочности стены." },
      fletching: { name: "Оперение", description: "+8% урона." },
      tactics: { name: "Тактика", description: "Залп перезаряжается на 0,5 с быстрее." },
      headStart: { name: "Фора", description: "Бесплатное улучшение перед первой волной." },
    },
  },
};
