import type { AppLang } from "@/lib/apps/lang";
import { BASE, SKILLS } from "./sim/balance";
import type { TowerStats } from "./sim/stats";
import type { EnemyKind, PerkId, SkillId, UpgradeId } from "./sim/types";

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
  continueRun: string;
  continueHint: (wave: number, gold: number) => string;
  continuePaused: string;
  discardRun: string;
  discardRunConfirm: string;
  replaceRunConfirm: string;
  unknownRunConfirm: string;
  saveAndMenu: string;
  saveUnavailable: string;
  retrySave: string;
  savedPerksHint: string;
  playAgain: string;
  menu: string;
  home: string;
  perksTitle: string;
  perksHint: string;
  chooseSkill: string;
  skillSelectionHint: string;
  back: string;
  best: (wave: number) => string;
  gold: (amount: number) => string;
  level: (level: number) => string;
  buy: (cost: number) => string;
  maxed: string;
  wave: (wave: number) => string;
  bossWave: string;
  nextWave: (wave: number) => string;
  enemiesLeft: (count: number) => string;
  bestiary: Record<EnemyKind, Blurb>;
  autofire: string;
  autofireHint: string;
  on: string;
  off: string;
  loadout: string;
  loadoutSkill: string;
  loadoutEmpty: string;
  hintHold: string;
  hintSkill: string;
  wall: string;
  skillReady: string;
  skillRecharging: (seconds: string) => string;
  skillTarget: (name: string) => string;
  skillCancel: string;
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
  skills: Record<SkillId, Blurb>;
  skillStats: Record<SkillId, UpgradeStats>;
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
      "Choose Catapult for area damage or Frost Field to stop a crowd.",
      "Use the skill button, then drag on the field and release. After each wave, pick an upgrade.",
      "Gold from every run buys perks that last.",
    ],
    play: "Play",
    continueRun: "Continue run",
    continueHint: (wave, gold) => `Wave ${wave} · ${gold} unbanked gold`,
    continuePaused: "Continues paused. No time passes while away; hold the field again to shoot.",
    discardRun: "Discard saved run",
    discardRunConfirm: "Discard this unfinished run and its unbanked gold? Permanent gold and perks will be kept.",
    replaceRunConfirm: "Start a new run and discard the unfinished one and its unbanked gold? Permanent gold and perks will be kept.",
    unknownRunConfirm: "Saved runs could not be read. Start anyway? This may replace an existing run and its unbanked gold.",
    saveAndMenu: "Save & menu",
    saveUnavailable: "Saving is unavailable. Keep this tab open: reloading may lose progress. Finished rewards must be saved before a new run or perk purchase.",
    retrySave: "Retry saving",
    savedPerksHint: "New perks apply to new runs, not the saved run.",
    playAgain: "Play again",
    menu: "Menu",
    home: "Home",
    perksTitle: "Perks",
    perksHint: "Bought with gold, kept for every run.",
    chooseSkill: "Choose your skill",
    skillSelectionHint: "One active skill for this run. Both are available from the start.",
    back: "Back",
    best: (wave) => (wave > 0 ? `Best: wave ${wave}` : "No runs yet"),
    gold: (amount) => `${amount} gold`,
    level: (level) => `Lv ${level}`,
    buy: (cost) => `Buy · ${cost}`,
    maxed: "Max",
    wave: (wave) => `Wave ${wave}`,
    bossWave: "Boss",
    nextWave: (wave) => `Next: wave ${wave}`,
    enemiesLeft: (count) => `${count} left`,
    bestiary: {
      grunt: { name: "Footman", description: "Marches straight at the wall." },
      runner: { name: "Runner", description: "Fast but frail." },
      brute: { name: "Brute", description: "Slow, heavy blows at the wall." },
      bat: { name: "Bat", description: "Flies over caltrops; arrows and skills still hit it." },
      boss: { name: "Warlord", description: "Calls in grunts every 8 s — watch for his horn call." },
    },
    autofire: "Auto-fire",
    autofireHint: "The archer shoots the nearest threat on his own. Hold the field to take over.",
    on: "on",
    off: "off",
    loadout: "Loadout",
    loadoutSkill: "Skill",
    loadoutEmpty: "No upgrades yet.",
    hintHold: "Hold the field to shoot",
    hintSkill: "Skill: press the button, then drag and release",
    wall: "Wall",
    skillReady: "Ready",
    skillRecharging: (seconds) => `${seconds} s`,
    skillTarget: (name) => `Target ${name}: drag on the field, release to cast`,
    skillCancel: "Cancel targeting",
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
    fieldLabel: "Battlefield. Hold to shoot; arrows or WASD aim and Space fires. Use the skill button, then drag and release. Keyboard: 1 targets the skill, arrows move the target, Enter casts, Escape cancels.",
    skills: {
      catapult: { name: "Catapult", description: "A marked area blast with dependable damage and a 3 s burn. Hits ground and air." },
      frostField: { name: "Frost Field", description: "Freeze ordinary enemies, then slow them. Bosses are slowed instead of frozen." },
    },
    skillStats: {
      catapult: (s) => [
        ["Damage", EN.num(s.skillDamage)],
        ["Area", EN.num(s.skillRadius)],
        ["Reload", `${EN.num(s.skillCooldown)} s`],
      ],
      frostField: (s) => [
        ["Freeze", `${EN.num(SKILLS.frostField.freezeSeconds)} s`],
        ["Area", EN.num(s.skillRadius)],
        ["Reload", `${EN.num(s.skillCooldown)} s`],
      ],
    },
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
      skillSize: { name: "Skill engineering", description: "Increase the equipped skill's target area." },
      skillCooldown: { name: "Battle drill", description: "The equipped skill reloads 1.2 s sooner." },
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
      skillSize: (s) => [["Area", EN.num(s.skillRadius)]],
      skillCooldown: (s) => [["Reload", `${EN.num(s.skillCooldown)} s`]],
      caltrops: (s) => [
        ["Slow", EN.pct(s.caltropSlow)],
        ["Lasts", `${s.caltropLife} s`],
      ],
    },
    perks: {
      fortify: { name: "Fortify", description: "+15 wall HP." },
      fletching: { name: "Fletching", description: "+8% damage." },
      quickDraw: { name: "Drill", description: "Shoot 5% faster." },
      tactics: { name: "Tactics", description: "The equipped skill reloads 0.5 s sooner." },
      headStart: { name: "Head start", description: "A free upgrade before wave 1." },
    },
    perkStats: {
      fortify: (s) => [["Wall", `+${EN.num(s.maxHp - BASE.maxHp)} HP`]],
      fletching: (s) => [["Damage", `+${EN.pct(s.damage / BASE.damage - 1)}`]],
      quickDraw: (s) => [["Shooting speed", `+${EN.pct(BASE.reload / s.reload - 1)}`]],
      tactics: (s) => [["Skill reload", `−${EN.num(SKILLS.catapult.cooldown - s.skillCooldown)} s`]],
      headStart: (_s, level) => [["Free upgrades", `${level}`]],
    },
  },
  ru: {
    title: "Одинокая башня",
    tagline: "Один лучник на башне замка, а лес полон врагов. Цельтесь, стреляйте и держите стену сколько сможете.",
    howTo: [
      "Держите палец на поле, и лучник стреляет в ту сторону.",
      "Выберите катапульту для урона по области или ледяное поле для остановки толпы.",
      "Нажмите кнопку навыка, затем проведите по полю и отпустите. После волны выберите улучшение.",
      "Золото из каждого забега тратится на постоянные бонусы.",
    ],
    play: "Играть",
    continueRun: "Продолжить забег",
    continueHint: (wave, gold) => `Волна ${wave} · ${gold} золота ещё не зачислено`,
    continuePaused: "Продолжение на паузе. В отсутствие игрока время не идёт; для стрельбы снова удерживайте палец на поле.",
    discardRun: "Удалить сохранённый забег",
    discardRunConfirm: "Удалить незавершённый забег и его незачисленное золото? Постоянные золото и бонусы сохранятся.",
    replaceRunConfirm: "Начать новый забег и удалить незавершённый вместе с незачисленным золотом? Постоянные золото и бонусы сохранятся.",
    unknownRunConfirm: "Не удалось прочитать сохранённый забег. Всё равно начать новый? Он может заменить существующий забег и его незачисленное золото.",
    saveAndMenu: "Сохранить и в меню",
    saveUnavailable: "Сохранение недоступно. Не закрывайте вкладку: перезагрузка может привести к потере прогресса. Перед новым забегом или покупкой бонуса нужно сохранить награды.",
    retrySave: "Повторить сохранение",
    savedPerksHint: "Новые бонусы действуют в новых забегах, но не в сохранённом.",
    playAgain: "Ещё раз",
    menu: "Меню",
    home: "На главную",
    perksTitle: "Бонусы",
    perksHint: "Покупаются за золото и действуют в каждом забеге.",
    chooseSkill: "Выберите навык",
    skillSelectionHint: "Один активный навык на забег. Оба доступны сразу.",
    back: "Назад",
    best: (wave) => (wave > 0 ? `Рекорд: волна ${wave}` : "Забегов ещё не было"),
    gold: (amount) => `${amount} золота`,
    level: (level) => `Ур. ${level}`,
    buy: (cost) => `Купить · ${cost}`,
    maxed: "Макс.",
    wave: (wave) => `Волна ${wave}`,
    bossWave: "Босс",
    nextWave: (wave) => `Далее: волна ${wave}`,
    enemiesLeft: (count) => `Осталось: ${count}`,
    bestiary: {
      grunt: { name: "Пехотинец", description: "Идёт прямо к стене." },
      runner: { name: "Бегун", description: "Быстрый, но хрупкий." },
      brute: { name: "Громила", description: "Медленный, бьёт стену сильно." },
      bat: { name: "Летучая мышь", description: "Летит над шипами; стрелы и навыки её всё же достают." },
      boss: { name: "Военачальник", description: "Зовёт пехотинцев каждые 8 с — следите за его сигналом." },
    },
    autofire: "Автострельба",
    autofireHint: "Лучник сам стреляет по ближайшей угрозе. Удерживайте поле, чтобы взять управление.",
    on: "вкл",
    off: "выкл",
    loadout: "Снаряжение",
    loadoutSkill: "Навык",
    loadoutEmpty: "Улучшений пока нет.",
    hintHold: "Удерживайте поле, чтобы стрелять",
    hintSkill: "Навык: нажмите кнопку, затем проведите по полю и отпустите",
    wall: "Стена",
    skillReady: "Готов",
    skillRecharging: (seconds) => `${seconds} с`,
    skillTarget: (name) => `Цель: ${name}. Проведите по полю и отпустите`,
    skillCancel: "Отменить прицеливание",
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
    fieldLabel: "Поле боя. Удерживайте для стрельбы; стрелки или WASD целятся, пробел стреляет. Нажмите кнопку навыка, затем проведите по полю и отпустите. Клавиша 1 выбирает цель навыка, стрелки двигают её, Enter применяет навык, Escape отменяет.",
    skills: {
      catapult: { name: "Катапульта", description: "Точный удар по отмеченной области с уроном и горением 3 с. Поражает наземных и летающих." },
      frostField: { name: "Ледяное поле", description: "Замораживает обычных врагов, затем замедляет их. Боссов замедляет без заморозки." },
    },
    skillStats: {
      catapult: (s) => [
        ["Урон", RU.num(s.skillDamage)],
        ["Область", RU.num(s.skillRadius)],
        ["Перезарядка", `${RU.num(s.skillCooldown)} с`],
      ],
      frostField: (s) => [
        ["Заморозка", `${RU.num(SKILLS.frostField.freezeSeconds)} с`],
        ["Область", RU.num(s.skillRadius)],
        ["Перезарядка", `${RU.num(s.skillCooldown)} с`],
      ],
    },
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
      skillSize: { name: "Инженерия навыка", description: "Увеличивает область выбранного навыка." },
      skillCooldown: { name: "Боевая выучка", description: "Выбранный навык перезаряжается на 1,2 с быстрее." },
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
      skillSize: (s) => [["Область", RU.num(s.skillRadius)]],
      skillCooldown: (s) => [["Перезарядка", `${RU.num(s.skillCooldown)} с`]],
      caltrops: (s) => [
        ["Замедление", RU.pct(s.caltropSlow)],
        ["Держатся", `${s.caltropLife} с`],
      ],
    },
    perks: {
      fortify: { name: "Укрепление", description: "+15 к прочности стены." },
      fletching: { name: "Оперение", description: "+8% урона." },
      quickDraw: { name: "Выучка", description: "Стрельба на 5% быстрее." },
      tactics: { name: "Тактика", description: "Выбранный навык перезаряжается на 0,5 с быстрее." },
      headStart: { name: "Фора", description: "Бесплатное улучшение перед первой волной." },
    },
    perkStats: {
      fortify: (s) => [["Стена", `+${RU.num(s.maxHp - BASE.maxHp)}`]],
      fletching: (s) => [["Урон", `+${RU.pct(s.damage / BASE.damage - 1)}`]],
      quickDraw: (s) => [["Скорость стрельбы", `+${RU.pct(BASE.reload / s.reload - 1)}`]],
      tactics: (s) => [["Перезарядка навыка", `−${RU.num(SKILLS.catapult.cooldown - s.skillCooldown)} с`]],
      headStart: (_s, level) => [["Бесплатных улучшений", `${level}`]],
    },
  },
};
