import type { ClassId } from "./sim/classes";
import type { EncounterTradeoff } from "./career";
import type { AppLang } from "@/lib/apps/lang";
import { QUIRK_NUMBER } from "./sim/balance";
import { QUIRKS } from "@/lib/roster/data";
import type { ItemId, ItemState } from "@/lib/hr/kit";
import type { DepartmentId, Effect, PerkId, QuirkId, Stat } from "@/lib/roster/types";
import type { Blurb } from "@/lib/tower/i18n";
import type { FoeKind, MutationId, PassiveId, Stage, WeaponId } from "./sim/types";

/** A class card at the pick: an identity, its two weapons, and what to watch out for. */
export interface ClassCopy {
  name: string;
  tagline: string;
  kit: string[];
  tradeoff: string;
}

export interface HrText {
  title: string;
  tagline: string;
  howTo: string[];
  /** The summary of the collapsible how-to. */
  howToTitle: string;
  home: string;
  continueRun: string;
  continueHint: (name: string, time: string) => string;
  goToWork: string;
  chooseClass: string;
  classHint: string;
  classStartingGear: string;
  classArchived: string;
  classPassiveLabel: string;
  classTradeoffLabel: string;
  classes: Record<ClassId, ClassCopy>;
  day: (day: number) => string;
  /** Rank titles, lowest first; the last one repeats. */
  ranks: string[];
  careerLevel: (level: number) => string;
  xpProgress: (xp: number, next: number) => string;
  savings: (gold: string) => string;
  leveledUp: (level: number) => string;
  promoted: (rank: string) => string;
  percent: (value: number) => string;
  interviewClock: (boss: string, time: string) => string;
  perks: Record<PerkId, Blurb>;
  perkTitle: (name: string) => string;
  perkTradeoff: (day: EncounterTradeoff, interview: EncounterTradeoff) => string;
  perksLine: (names: string) => string;
  stages: Record<Stage, { name: string; blurb: string }>;
  startOver: string;
  startOverConfirm: string;
  departments: Record<DepartmentId, string>;
  stats: Record<Stat, string>;
  /** The department skills: the button's name and cooldown, and the icon's glyph. */
  skillNames: Record<Exclude<DepartmentId, "interns">, string>;
  skillGlyph: Record<Exclude<DepartmentId, "interns">, string>;
  skillHint: (department: Exclude<DepartmentId, "interns">) => string;
  skillButton: (name: string, seconds: number) => string;
  skillAim: string;
  /** The desk kit, on the card and in the panels. */
  itemNames: Record<ItemId, string>;
  itemLine: (item: ItemState) => string;
  kitLabel: string;
  kitEmpty: string;
  lootFound: (names: string) => string;
  scrapped: (names: string, gold: string) => string;
  /** The card's stat block: the meal, not the recipe — what the coworker is actually capable of. */
  cardStats: (v: { hp: number; damage: number; speed: number; rate: number; gold: number; loot: number }) => { label: string; value: string }[];
  quirks: Record<QuirkId, string>;
  /** What a quirk effect changes, after its percent. */
  effects: Record<Effect, string>;
  inactiveEffects: (effects: string) => string;
  noActiveQuirk: string;
  traitHelpTitle: string;
  traitHelp: string;
  weapons: Record<WeaponId, Blurb>;
  passives: Record<PassiveId, Blurb>;
  /** The hammers: one pattern bend per weapon (P3, hr-harder-roadmap). */
  hammers: Record<MutationId, Blurb>;
  hammerOf: (weapon: string) => string;
  heal: (percent: number) => Blurb;
  gold: Blurb;
  levelUp: string;
  pickOne: string;
  isNew: string;
  level: (level: number) => string;
  hp: string;
  goldAmount: (amount: number) => string;
  foes: Record<FoeKind, string>;
  /** What comes next on the clock, e.g. "Auditor in 1:20". */
  next: (who: string, time: string) => string;
  /** Where the descent is, e.g. "Floor 3". */
  floor: (floor: number) => string;
  floorWave: (floor: number, phase: number) => string;
  bossArrives: (boss: string) => string;
  /** The panel after a floor's boss falls. */
  floorCleared: string;
  floorClearedHint: string;
  /** What the stairs lead to, e.g. "Next: floor 5, the Kitchen". */
  nextFloor: (floor: number, stage: string) => string;
  /** Elites, enrage, rush, slump, cameos, hammers and the keepsake swap (P1–P3). */
  eliteHint: string;
  enrageHint: string;
  rushWarn: string;
  rushLive: string;
  slumpLine: (days: number) => string;
  cameoSenior: string;
  cameoNurse: string;
  cameoRival: (need: number) => string;
  cameoRivalWin: (gold: number) => string;
  cameoRivalLose: string;
  swapAsk: string;
  swapButton: (item: string) => string;
  swapAuto: string;
  /** One line per boss, shown as it walks in; the horde kinds need none. */
  bossHints: Partial<Record<FoeKind, string>>;
  descend: string;
  pause: string;
  paused: string;
  resume: string;
  walkOut: string;
  walkOutHint: string;
  won: string;
  fell: string;
  auditClosed: string;
  walkedOut: string;
  lasted: (time: string) => string;
  reached: (level: number) => string;
  floors: (floors: number) => string;
  kills: (kills: number) => string;
  goldEarned: (amount: number) => string;
  playAgain: string;
  menu: string;
  fieldLabel: string;
}

export const HR_TEXT: Record<AppLang, HrText> = {
  en: {
    title: "HR Department",
    tagline: "One hero, one office, twenty floors of trouble a day. They fight on their own; you steer.",
    howTo: [
      "Drag anywhere to move; your coworker attacks on their own.",
      "Pick up the gems to level up, then choose an upgrade.",
      "Whatever you leave the office with — level, weapons, gear — is yours to keep for tomorrow.",
      "The day is twenty floors down, each ending in its own boss. Beat floor 20's Auditor and the day is yours.",
      "Some horde foes come in elite from the kitchen on — they hit harder and barely move when struck.",
      "A boss dragged out too long gets angrier every half minute. Elites, hammers and cameos pay off — find them.",
    ],
    howToTitle: "How to play",
    home: "← All apps",
    continueRun: "Continue the run",
    continueHint: (name, time) => `${name}, at ${time}`,
    goToWork: "Go to work",
    chooseClass: "Choose a career class",
    classHint:
      "Your class sets what level-ups and bosses offer — only its weapons and passive come up, and each class fights with its own default weapon from the first minute: Business Cards, Sticky Notes or Server Rack. Coffee, Gym, Sneakers and Mentor stay shared. The choice locks when you start work.",
    classStartingGear: "Starts with",
    classArchived: "Stored, not equipped",
    classPassiveLabel: "Class passive",
    classTradeoffLabel: "Watch out",
    classes: {
      fieldRep: {
        name: "Field Rep",
        tagline: "A mobile shooter: line foes up and pierce them from a distance.",
        kit: [
          "Business Cards: a fan of piercing shots that lean toward the foes you face — your default weapon",
          "Spreadsheet: hurled at the nearest foe, piercing through a line",
        ],
        tradeoff: "Nothing protects you up close: no knockback, no shot blocking.",
      },
      compliance: {
        name: "Compliance Officer",
        tagline: "A front-line regulator: hold the crowd at arm's length.",
        kit: [
          "Sticky Notes: a stream of notes that chase the nearest foes — your default weapon",
          "Policy Binder: swings around you, knocking crowds back — and swats up to two nearby shots out of the air",
          "Rubber Duck: ducks orbit you and peck everything they touch",
        ],
        tradeoff: "Short reach: you must stand close to hurt anything.",
      },
      systems: {
        name: "Systems Operator",
        tagline: "An area-effects engineer: rain hardware on packed groups.",
        kit: [
          "Server Rack: crashes down on packed groups — but hits lone bosses for less — your default weapon",
          "Fine Print: a slowing, damaging cloud of contract clauses around you",
        ],
        tradeoff: "No escape tool: when a group closes in, you fight your way out.",
      },
    },
    day: (day) => `Day ${day}`,
    ranks: ["Trainee", "Junior", "Specialist", "Senior", "Lead", "Director"],
    careerLevel: (level) => `Level ${level}`,
    xpProgress: (xp, next) => `XP: ${xp} / ${next}`,
    savings: (gold) => `Savings: ${gold}`,
    leveledUp: (level) => `Level up: ${level}!`,
    promoted: (rank) => `Promoted to ${rank}!`,
    percent: (value) => `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)}%`,
    interviewClock: (boss, time) => `${boss}, ${time} left`,
    perks: {
      coffeeRun: { name: "Coffee Run", description: "Starts every run with coffee: faster attacks." },
      gymPass: { name: "Gym Pass", description: "Starts every run with more health." },
      freshSneakers: { name: "Fresh Sneakers", description: "Starts every run moving faster." },
      mentorship: { name: "Mentorship", description: "Starts every run with bonus XP." },
      overtime: { name: "Overtime", description: "The signature weapon starts a level higher." },
      cornerOffice: { name: "Corner Office", description: "One extra choice at every level-up." },
      secondWind: { name: "Second Wind", description: "Gets back up once per run after falling." },
    },
    perkTitle: (name) => `Promotion! ${name} earns a perk`,
    perkTradeoff: (day, interview) => `Tradeoff vs. your current enemies (approx.): enemy health +${HR_TEXT.en.percent(day.health)}, spawn rate +${HR_TEXT.en.percent(day.spawns)}; interviews — health +${HR_TEXT.en.percent(interview.health)}, spawn rate +${HR_TEXT.en.percent(interview.spawns)}.`,
    perksLine: (names) => `Perks: ${names}`,
    stages: {
      openSpace: { name: "Open space", blurb: "The usual office floor." },
      kitchen: { name: "Kitchen", blurb: "Coffee spills slow you down and microwaves fire rings of popcorn. Harder, with more gold and XP." },
      serverRoom: { name: "Server room", blurb: "Floor vents flash, then blast heat, and the Sysadmin sends pings. Harder still, with even more gold and XP." },
      boardroom: { name: "The Boardroom", blurb: "Where the audit happens. Projectors flash and blast wide cones of light. The last act, floors 14 to 20." },
    },
    startOver: "Start a new career",
    startOverConfirm: "Start over? Your coworker's level and savings will be lost.",
    departments: {
      engineering: "Engineering",
      finance: "Finance",
      legal: "Legal",
      sales: "Sales",
      it: "IT",
      hr: "HR",
      interns: "Interns",
    },
    stats: { grit: "Grit", output: "Output", hustle: "Hustle", focus: "Focus", luck: "Luck" },
    skillNames: {
      engineering: "Rubber Duck Program",
      finance: "Audit",
      legal: "Cease & Desist",
      sales: "Cold Call",
      it: "Rollback",
      hr: "Team Building",
    },
    skillGlyph: {
      engineering: "🦆",
      finance: "🔍",
      legal: "📜",
      sales: "📞",
      it: "↩️",
      hr: "🎉",
    },
    skillHint: (department) =>
      ({
        engineering: "Rubber Duck Program: drop a decoy duck — the horde piles onto it while you reposition.",
        finance: "Audit: mark the foes around the tap — they take half again as much and pay double gold.",
        legal: "Cease & Desist: bind every foe around the tap for a moment — contracts hold.",
        sales: "Cold Call: the nearest pack hesitates and takes a card's worth of hurt.",
        it: "Rollback: erase every shot on the screen and duck behind a moment of cover.",
        hr: "Team Building: patch up a quarter of your health and carry the team's pace for a moment.",
      })[department],
    skillButton: (name, seconds) => (seconds > 0 ? `${name} ${Math.ceil(seconds)}s` : name),
    skillAim: "Aim…",
    itemNames: {
      shredderGuard: "Shredder Guard",
      goldenBadge: "Golden Badge",
      cableUntangler: "Cable Untangler",
      redPen: "Auditor's Red Pen",
      guardianWings: "Guardian Wings",
      hermesLoafers: "Winged Loafers",
    },
    itemLine: (item) => `${HR_TEXT.en.itemNames[item.id]} Lv ${item.level}`,
    kitLabel: "Desk",
    kitEmpty: "a bare desk — the bosses owe it loot",
    lootFound: (names) => `Found: ${names}`,
    scrapped: (names, gold) => `Scrapped ${names} for ${gold} gold`,
    cardStats: (v) => {
      const pct = (value: number) => `${value >= 0 ? "+" : "\u2212"}${Math.abs(Math.round(value))}%`;
      return [
        { label: "Health", value: `${Math.round(v.hp)}` },
        { label: "Damage", value: pct(v.damage) },
        { label: "Speed", value: pct(v.speed) },
        { label: "Attack rate", value: pct(v.rate) },
        { label: "Gold", value: pct(v.gold) },
        { label: "Lucky find", value: pct(v.loot) },
      ];
    },
    quirks: {
      caffeinated: "Caffeinated",
      stealsLunches: "Steals lunches",
      overachiever: "Overachiever",
      loyal: "Loyal",
      networker: "Networker",
      nightOwl: "Night owl",
      gymRegular: "Gym regular",
      perfectionist: "Perfectionist",
      clockWatcher: "Clock-watcher",
      officeGossip: "Office gossip",
      unionRep: "Union rep",
      coffeeSnob: "Coffee snob",
      standingDesk: "Standing desk",
    },
    effects: {
      grit: "health",
      output: "damage",
      hustle: "speed",
      focus: "attack speed",
      luck: "gold",
      gold: "gold",
      xp: "XP",
      damageTaken: "damage taken",
      quitChance: "chance to quit",
      teamQuitChance: "colleagues' chance to quit",
      salary: "salary",
    },
    inactiveEffects: (effects) => `Inactive in HR: ${effects}.`,
    noActiveQuirk: "No active run effect.",
    traitHelpTitle: "How traits work",
    traitHelp: "Trait percentages modify run stats and rewards, not absolute probabilities. XP means gem XP during a run, not career review XP. Attack-speed traits shorten weapon cooldowns; they do not speed up orbiting ducks. Resignation and salary are not implemented in HR: their effects do nothing, and no resignation rolls occur.",
    weapons: {
      stickyNotes: { name: "Sticky notes", description: "A stream of notes that chase the nearest foes." },
      spreadsheet: { name: "Spreadsheet", description: "Thrown at the nearest foe, straight through several." },
      serverRack: { name: "Server rack", description: "Dropped on a foe nearby; hits everything under it." },
      policyBinder: { name: "Policy binder", description: "A swing that hits everything close and knocks it back." },
      rubberDuck: { name: "Rubber duck", description: "Ducks deal contact damage on their orbit, without knockback. The inside of the ring is not protected." },
      contract: { name: "Fine print", description: "Everything close is slowed and keeps taking damage." },
      businessCard: { name: "Business cards", description: "A fan of cards thrown the way you face." },
    },
    hammers: {
      tandem: { name: "Tandem notes", description: "Two more notes every volley, each a quarter lighter." },
      ricochet: { name: "Thick stock", description: "The sheet punches through two more foes, a fifth lighter." },
      overclocked: { name: "Overclocked rack", description: "Slams down much sooner, and spreads a fifth wider." },
      gravity: { name: "Gravity well", description: "The swing pulls foes in instead of shoving, and hits a third harder." },
      wide: { name: "Wide waddle", description: "The orbit is a third wider, and it slows twice as hard." },
      deep: { name: "Deep print", description: "The fine print reaches a quarter further and slows half again as hard." },
      burst: { name: "Card burst", description: "Three more cards in every fan, each a quarter lighter." },
    },
    hammerOf: (weapon) => `Hammer: ${weapon}`,
    passives: {
      coffee: { name: "Coffee", description: "Every weapon is ready 8% sooner." },
      gym: { name: "Gym membership", description: "15% more health." },
      sneakers: { name: "Sneakers", description: "Move 8% faster." },
      lanyard: { name: "Lanyard", description: "Gems fly to you from 30% further." },
      mentor: { name: "Mentor", description: "10% more XP." },
      ergoChair: { name: "Ergonomic chair", description: "Take 8% less damage." },
      powerTie: { name: "Power tie", description: "Deal 10% more damage." },
    },
    heal: (percent) => ({ name: "Snack break", description: `Heal ${percent}% of your max health.` }),
    gold: { name: "Petty cash", description: "Take 10 gold." },
    levelUp: "Level up!",
    pickOne: "Pick one",
    isNew: "New",
    level: (level) => `Level ${level}`,
    hp: "Health",
    goldAmount: (amount) => `${amount} gold`,
    foes: {
      replyAll: "Reply-All Storm",
      paperPlane: "Paper Plane",
      mondayBlob: "Monday Blob",
      meetingInvite: "Meeting Invite",
      printerJam: "Printer Jam",
      middleManager: "Middle Manager",
      lunchMonitor: "Lunch Monitor",
      sysadmin: "Sysadmin",
      auditor: "Auditor",
      teamLead: "Team Lead",
      hrManager: "HR Manager",
      recruiter: "Recruiter",
      meetingChair: "Meeting Chair",
      shredder: "The Shredder",
      coffeeMachine: "The Coffee Machine",
      vendingMachine: "The Vending Machine",
      printerPrime: "Printer Jam Prime",
      blobPrime: "Monday Blob Prime",
      paperShredling: "Paper Shredling",
      rollingCart: "Rolling Cart",
      patchDrone: "Patch Drone",
      securityEscort: "Security Escort",
      lunchThief: "Lunch Thief",
      greaseFire: "Grease Fire",
      looseCable: "Loose Cable",
      hotRack: "Hot Rack",
    },
    next: (who, time) => `${who} in ${time}`,
    floor: (floor) => `Floor ${floor}`,
    floorCleared: "Floor cleared",
    floorClearedHint: "Take a pick, then take the stairs.",
    nextFloor: (floor, stage) => `Next: floor ${floor}, the ${stage}`,
    eliteHint: "From the kitchen on, some foes come in elite — they don't flinch, barely budge when hit, and hit half again as hard. They pay double.",
    enrageHint: "A boss fought too long gets angry: its damage climbs every half minute. Finish the fight.",
    rushWarn: "A rush is coming!",
    rushLive: "Rush!",
    floorWave: (floor, phase) => `Floor ${floor} · Wave ${phase}/3`,
    bossArrives: (boss) => `${boss} is here`,
    slumpLine: (days) => `Slump ×${days} — today the office goes a little easier on you.`,
    cameoSenior: "A retired senior sits in — one extra choice.",
    cameoNurse: "The office nurse patched you up.",
    cameoRival: (need) => `Rival intern: beat ${need} kills this floor for bonus gold.`,
    cameoRivalWin: (gold) => `Rival beaten — +${gold} gold.`,
    cameoRivalLose: "The rival out-KPI'd you. Next floor.",
    swapAsk: "The desk is full — what does the new relic replace?",
    swapButton: (item) => `Swap out ${item}`,
    swapAuto: "Leave it to the desk (the oldest goes)",
    bossHints: {
      middleManager: "It charges at where you were. Keep moving.",
      meetingChair: "It never moves, but the meeting keeps growing. Clear the room.",
      teamLead: "Fast charges — and its team follows them. Dodge early.",
      shredder: "Its shreddings fly over you at point blank. Step out between the fans.",
      lunchMonitor: "It charges, dropping lunch thieves as it goes. Punish the charge.",
      hrManager: "Fans of paperwork, and every third a ring. Watch the gaps.",
      coffeeMachine: "It lobs where you stand, and its puddles slow you. Keep moving.",
      recruiter: "Copies, copies everywhere. Find the real one.",
      printerPrime: "It walks and spits toner. Outrange it, or circle behind.",
      sysadmin: "Pings in fans — and it blinks away when you close in.",
      blobPrime: "Its steps send shockwaves. Stay outside the ring.",
      auditor: "Rings of red tape and chains of reply-alls. At half hp it gets angry.",
    },
    descend: "Descend",
    pause: "Pause",
    paused: "Paused",
    resume: "Resume",
    walkOut: "Walk out",
    walkOutHint: "Walking out counts as falling.",
    won: "Audit passed!",
    fell: "Down for the day",
    auditClosed: "The audit closed",
    walkedOut: "Walked out",
    lasted: (time) => `Lasted ${time}`,
    reached: (level) => `Reached level ${level}`,
    floors: (floors) => `Floor ${floors} reached`,
    kills: (kills) => `${kills} foes cleared`,
    goldEarned: (amount) => `${amount} gold earned`,
    playAgain: "Again",
    menu: "Menu",
    fieldLabel: "The office floor. Drag, or use the arrow keys or WASD, to move. Escape pauses.",
  },
  ru: {
    title: "Отдел кадров",
    tagline: "Один герой, один офис и двадцать этажей бед в день. Он дерётся сам, вы ведёте.",
    howTo: [
      "Тяните в любом месте, чтобы идти; сотрудник атакует сам.",
      "Собирайте кристаллы, чтобы расти в уровне и выбирать улучшения.",
      "Всё, с чем вы уходите из офиса — уровень, оружие, снаряжение — остаётся с вами до завтра.",
      "День — это двадцать этажей вниз, и на каждом свой босс. Одолей Аудитора на двадцатом — и день твой.",
      "С кухни и ниже часть врагов приходит элитной — бьёт сильнее и почти не реагирует на удары.",
      "Затянутый босс злится каждые полминуты. Элитные, молоты и гости — ищи их, они платят.",
    ],
    howToTitle: "Как играть",
    home: "← Все приложения",
    continueRun: "Продолжить забег",
    continueHint: (name, time) => `${name}, ${time}`,
    goToWork: "На работу",
    chooseClass: "Выберите класс",
    classHint:
      "Класс задаёт награды за уровни и боссов — в выпадениях только его оружие и пассив, и каждый класс с первой минуты дерётся своим оружием по умолчанию: визитки, стикеры или серверная стойка. Кофе, зал, кроссовки и наставник — общие. Выбор закрепляется с началом работы.",
    classStartingGear: "На старте",
    classArchived: "На хранении, не экипировано",
    classPassiveLabel: "Пассив класса",
    classTradeoffLabel: "Слабое место",
    classes: {
      fieldRep: {
        name: "Торговый представитель",
        tagline: "Мобильный стрелок: выстраивайте врагов в линию и пробивайте насквозь.",
        kit: [
          "Визитки: веер пробивающих выстрелов, доворачивающих к целям перед вами — оружие по умолчанию",
          "Таблица: летит в ближайшего врага и пробивает линию насквозь",
        ],
        tradeoff: "Вблизи никакой защиты: ни отбрасывания, ни сбивания снарядов.",
      },
      compliance: {
        name: "Специалист по регламенту",
        tagline: "Регулятор на передовой: держите толпу на расстоянии вытянутой папки.",
        kit: [
          "Стикеры: поток стикеров летит за ближайшими врагами — оружие по умолчанию",
          "Папка с политиками: вращается вокруг вас, отталкивает толпу — и сбивает до двух ближайших снарядов",
          "Резиновая утка: утки кружат вокруг вас и клюют всё, к чему прикоснутся",
        ],
        tradeoff: "Малая дальность: чтобы наносить урон, приходится стоять близко.",
      },
      systems: {
        name: "Системный оператор",
        tagline: "Инженер площадного урона: обрушивайте железо на плотные группы.",
        kit: [
          "Серверная стойка: падает на плотные группы — но по одиночным боссам бьёт слабее — оружие по умолчанию",
          "Мелкий шрифт: замедляющее и ранящее облако договорных пунктов вокруг вас",
        ],
        tradeoff: "Никуда не убежать: если группа взяла в кольцо, прорываться придётся боем.",
      },
    },
    day: (day) => `День ${day}`,
    ranks: ["Стажёр", "Младший", "Специалист", "Старший", "Ведущий", "Директор"],
    careerLevel: (level) => `Уровень ${level}`,
    xpProgress: (xp, next) => `Опыт: ${xp} / ${next}`,
    savings: (gold) => `Накопления: ${gold}`,
    leveledUp: (level) => `Новый уровень: ${level}!`,
    promoted: (rank) => `Повышение: ${rank}!`,
    percent: (value) => `${new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(value)}%`,
    interviewClock: (boss, time) => `${boss}, осталось ${time}`,
    perks: {
      coffeeRun: { name: "Кофе-брейк", description: "Каждый забег начинается с кофе: атаки быстрее." },
      gymPass: { name: "Абонемент в зал", description: "Каждый забег начинается с большим запасом здоровья." },
      freshSneakers: { name: "Новые кроссовки", description: "Каждый забег начинается с более быстрым шагом." },
      mentorship: { name: "Наставник", description: "Каждый забег начинается с бонусом к опыту." },
      overtime: { name: "Сверхурочные", description: "Фирменное оружие сразу на уровень выше." },
      cornerOffice: { name: "Угловой кабинет", description: "Лишний вариант при каждом повышении уровня." },
      secondWind: { name: "Второе дыхание", description: "Один раз за забег встаёт после падения." },
    },
    perkTitle: (name) => `Повышение! ${name} получает перк`,
    perkTradeoff: (day, interview) => `Цена относительно текущих врагов (примерно): здоровье врагов +${HR_TEXT.ru.percent(day.health)}, частота появления +${HR_TEXT.ru.percent(day.spawns)}; собеседования — здоровье +${HR_TEXT.ru.percent(interview.health)}, частота появления +${HR_TEXT.ru.percent(interview.spawns)}.`,
    perksLine: (names) => `Перки: ${names}`,
    stages: {
      openSpace: { name: "Опенспейс", blurb: "Обычный офисный этаж." },
      kitchen: { name: "Кухня", blurb: "Лужи кофе замедляют, а микроволновки стреляют кольцами попкорна. Сложнее, но больше золота и опыта." },
      serverRoom: { name: "Серверная", blurb: "Вентиляционные решётки мигают, а затем выдают жар, и сисадмин шлёт пинги. Ещё сложнее, но ещё больше золота и опыта." },
      boardroom: { name: "Зал заседаний", blurb: "Где проходит аудит. Проекторы мигают и бьют широкими кругами света. Последний акт, этажи 14–20." },
    },
    startOver: "Начать новую карьеру",
    startOverConfirm: "Начать заново? Уровень сотрудника и накопления пропадут.",
    departments: {
      engineering: "Разработка",
      finance: "Финансы",
      legal: "Юристы",
      sales: "Продажи",
      it: "ИТ",
      hr: "Кадры",
      interns: "Стажёры",
    },
    stats: { grit: "Закалка", output: "Отдача", hustle: "Напор", focus: "Фокус", luck: "Удача" },
    skillNames: {
      engineering: "Программа с уткой",
      finance: "Аудит",
      legal: "Предписание",
      sales: "Холодный звонок",
      it: "Откат",
      hr: "Тимбилдинг",
    },
    skillGlyph: {
      engineering: "🦆",
      finance: "🔍",
      legal: "📜",
      sales: "📞",
      it: "↩️",
      hr: "🎉",
    },
    skillHint: (department) =>
      ({
        engineering: "Программа с уткой: посади утку-приманку — толпа набежит на неё, а ты перестроишься.",
        finance: "Аудит: пометь врагов вокруг касания — им станет больнее, а золота они отдадут вдвое.",
        legal: "Предписание: свяжи всех вокруг касания на миг — договор есть договор.",
        sales: "Холодный звонок: ближайшая стая замрёт и получит по визитке.",
        it: "Откат: сотри все выстрелы с экрана и спрячься за мгновением прикрытия.",
        hr: "Тимбилдинг: подлечись на четверть и пронесись с командным темпом.",
      })[department],
    skillButton: (name, seconds) => (seconds > 0 ? `${name} ${Math.ceil(seconds)} с` : name),
    skillAim: "Прицел…",
    itemNames: {
      shredderGuard: "Щит шредера",
      goldenBadge: "Золотой бейдж",
      cableUntangler: "Распутыватель кабелей",
      redPen: "Красная ручка аудитора",
      guardianWings: "Крылья хранителя",
      hermesLoafers: "Крылатые тапки",
    },
    itemLine: (item) => `${HR_TEXT.ru.itemNames[item.id]} ур. ${item.level}`,
    kitLabel: "Стол",
    kitEmpty: "пока пусто — боссы ещё не принесли добычу",
    lootFound: (names) => `Найдено: ${names}`,
    scrapped: (names, gold) => `Пущено на запчасти: ${names} — ${gold} золота`,
    cardStats: (v) => {
      const pct = (value: number) => `${value >= 0 ? "+" : "\u2212"}${Math.abs(Math.round(value))}%`;
      return [
        { label: "Здоровье", value: `${Math.round(v.hp)}` },
        { label: "Урон", value: pct(v.damage) },
        { label: "Скорость", value: pct(v.speed) },
        { label: "Темп атаки", value: pct(v.rate) },
        { label: "Золото", value: pct(v.gold) },
        { label: "Шанс находки", value: pct(v.loot) },
      ];
    },
    quirks: {
      caffeinated: "Кофеман",
      stealsLunches: "Ворует обеды",
      overachiever: "Трудоголик",
      loyal: "Преданный",
      networker: "Нетворкер",
      nightOwl: "Сова",
      gymRegular: "Завсегдатай зала",
      perfectionist: "Перфекционист",
      clockWatcher: "Смотрит на часы",
      officeGossip: "Сплетник",
      unionRep: "Профорг",
      coffeeSnob: "Кофейный сноб",
      standingDesk: "Стол для работы стоя",
    },
    effects: {
      grit: "здоровья",
      output: "урона",
      hustle: "скорости",
      focus: "скорости атаки",
      luck: "золота",
      gold: "золота",
      xp: "опыта",
      damageTaken: "получаемого урона",
      quitChance: "шанс уволиться",
      teamQuitChance: "шанс увольнения коллег",
      salary: "зарплата",
    },
    inactiveEffects: (effects) => `Не действует в HR: ${effects}.`,
    noActiveQuirk: "Нет действующих эффектов в забеге.",
    traitHelpTitle: "Как работают черты",
    traitHelp: "Проценты черт изменяют характеристики и награды в забеге, а не задают абсолютные вероятности. Опыт — это опыт из кристаллов в забеге, а не опыт аттестации. Скорость атаки сокращает перезарядку оружия, но не ускоряет уточек на орбите. Увольнения и зарплата в HR не реализованы: эти эффекты ничего не меняют, случайных увольнений нет.",
    weapons: {
      stickyNotes: { name: "Стикеры", description: "Поток стикеров летит за ближайшими врагами." },
      spreadsheet: { name: "Таблица", description: "Летит в ближайшего врага и пробивает нескольких." },
      serverRack: { name: "Серверная стойка", description: "Падает на врага рядом и бьёт всех под собой." },
      policyBinder: { name: "Папка регламентов", description: "Удар по всем рядом с отбрасыванием." },
      rubberDuck: { name: "Резиновая уточка", description: "Уточки наносят урон при касании на орбите, без отталкивания. Внутри кольца защиты нет." },
      contract: { name: "Мелкий шрифт", description: "Все рядом замедляются и постоянно получают урон." },
      businessCard: { name: "Визитки", description: "Веер визиток туда, куда вы смотрите." },
    },
    hammers: {
      tandem: { name: "Стикеры парой", description: "На два стикера больше за залп, каждый на четверть легче." },
      ricochet: { name: "Плотная бумага", description: "Лист пробивает на два врага больше, на пятую часть легче." },
      overclocked: { name: "Разогнанный сервер", description: "Приземляется заметно быстрее и накрывает на пятую шире." },
      gravity: { name: "Гравитация", description: "Мах притягивает врагов вместо отбрасывания и бьёт на треть сильнее." },
      wide: { name: "Широкий вальс", description: "Орбита на треть шире, и замедление вдвое сильнее." },
      deep: { name: "Глубокий шрифт", description: "Мелкий шрифт достаёт на четверть дальше и тормозит в полтора раза сильнее." },
      burst: { name: "Веер визиток", description: "На три визитки больше в каждом веере, каждая на четверть легче." },
    },
    hammerOf: (weapon) => `Молот: ${weapon}`,
    passives: {
      coffee: { name: "Кофе", description: "Всё оружие готово на 8% быстрее." },
      gym: { name: "Абонемент в зал", description: "На 15% больше здоровья." },
      sneakers: { name: "Кроссовки", description: "Ходите на 8% быстрее." },
      lanyard: { name: "Бейдж на шнурке", description: "Кристаллы летят к вам на 30% издалека." },
      mentor: { name: "Наставник", description: "На 10% больше опыта." },
      ergoChair: { name: "Эргономичное кресло", description: "На 8% меньше урона." },
      powerTie: { name: "Галстук власти", description: "На 10% больше урона." },
    },
    heal: (percent) => ({ name: "Перекус", description: `Восстановить ${percent}% максимального здоровья.` }),
    gold: { name: "Касса", description: "Взять 10 золота." },
    levelUp: "Новый уровень!",
    pickOne: "Выберите одно",
    isNew: "Новое",
    level: (level) => `Уровень ${level}`,
    hp: "Здоровье",
    goldAmount: (amount) => `${amount} ${plural(amount, "золотой", "золотых", "золотых")}`,
    foes: {
      replyAll: "Ответ всем",
      paperPlane: "Бумажный самолётик",
      mondayBlob: "Понедельник",
      meetingInvite: "Приглашение на встречу",
      printerJam: "Зажевало бумагу",
      middleManager: "Менеджер среднего звена",
      lunchMonitor: "Контролёр обедов",
      sysadmin: "Сисадмин",
      auditor: "Аудитор",
      teamLead: "Тимлид",
      hrManager: "HR-менеджер",
      recruiter: "Рекрутёр",
      meetingChair: "Кресло совещаний",
      shredder: "Шредер",
      coffeeMachine: "Кофемашина",
      vendingMachine: "Торговый автомат",
      printerPrime: "Главный зажеватель бумаги",
      blobPrime: "Большой понедельник",
      paperShredling: "Бумажный обрезок",
      rollingCart: "Тележка на разгоне",
      patchDrone: "Дрон-ремонтник",
      securityEscort: "Охранник со щитом",
      lunchThief: "Похититель обедов",
      greaseFire: "Горящий жир",
      looseCable: "Путаница кабелей",
      hotRack: "Перегретый сервер",
    },
    next: (who, time) => `${who} через ${time}`,
    floor: (floor) => `Этаж ${floor}`,
    floorCleared: "Этаж зачищен",
    floorClearedHint: "Забери улучшение и спускайся ниже.",
    nextFloor: (floor, stage) => `Дальше: этаж ${floor}, ${stage}`,
    eliteHint: "С кухни и ниже часть врагов приходит элитной — не вздрагивает, почти не отлетает и бьёт в полтора раза сильнее. Платит вдвое.",
    enrageHint: "Босс, которого затянули, злится: каждые полминуты его урон растёт. Заканчивай бой.",
    rushWarn: "Надвигается наплыв!",
    rushLive: "Наплыв!",
    floorWave: (floor, phase) => `Этаж ${floor} · Волна ${phase}/3`,
    bossArrives: (boss) => `Босс на этаже: ${boss}`,
    slumpLine: (days) => `Полоса неудач ×${days} — сегодня офис пойдёт навстречу.`,
    cameoSenior: "В комнате отдыхает старший в отставке — лишний вариант.",
    cameoNurse: "Офисная медсестра подлатала тебя.",
    cameoRival: (need) => `Соперник-стажёр: набери ${need} убийств на этом этаже ради золота.`,
    cameoRivalWin: (gold) => `Соперник позади — +${gold} золота.`,
    cameoRivalLose: "Соперник перевыполнил KPI. В следующий раз.",
    swapAsk: "Стол полон — что заменяет новая реликвия?",
    swapButton: (item) => `Убрать ${item}`,
    swapAuto: "Оставить как было (уйдёт самый старый)",
    bossHints: {
      middleManager: "Делает рывок туда, где ты был. Не стой на месте.",
      meetingChair: "Стоит на месте, но совещание растёт. Расчисти зал.",
      teamLead: "Быстрые рывки — и команда бежит следом. Уходи заранее.",
      shredder: "Вплотную обрезки летят поверху. Выходи между веерами.",
      lunchMonitor: "Рывок — и прихватки с собой. Накажи его в момент рывка.",
      hrManager: "Вееры бумаг, а каждый третий — кольцо. Ищи щели.",
      coffeeMachine: "Льёт туда, где ты стоишь, а лужи тормозят. Двигайся.",
      recruiter: "Копий — хоть отбавляй. Найди настоящую.",
      printerPrime: "Ходит и плюётся тонером. Бей издали или зайди сзади.",
      sysadmin: "Пинги веерами — и телепорт, если подойти вплотную.",
      blobPrime: "От его шагов идёт ударная волна. Держись вне кольца.",
      auditor: "Кольца красной ленты и цепочки ответов-всем. На половине здоровья придёт в ярость.",
    },
    descend: "Спуститься",
    pause: "Пауза",
    paused: "Пауза",
    resume: "Продолжить",
    walkOut: "Уйти",
    walkOutHint: "Уход считается поражением.",
    won: "Аудит пройден!",
    fell: "На сегодня всё",
    auditClosed: "Аудит закрылся",
    walkedOut: "Ушли",
    lasted: (time) => `Продержались ${time}`,
    reached: (level) => `Дошли до уровня ${level}`,
    floors: (floors) => `Пройдено этажей: ${floors}`,
    kills: (kills) => `Разобрано врагов: ${kills}`,
    goldEarned: (amount) => `Заработано золота: ${amount}`,
    playAgain: "Ещё раз",
    menu: "Меню",
    fieldLabel: "Офис. Тяните пальцем, стрелками или WASD, чтобы идти. Escape ставит паузу.",
  },
};

/** Run modifiers first; unused roster effects are named without misleading probability numbers. */
export function quirkLine(text: HrText, quirk: QuirkId): string {
  const effects = Object.entries(QUIRKS[quirk]) as [Effect, number][];
  const active = effects.filter(([effect]) => QUIRK_NUMBER[effect] !== undefined);
  const inactive = effects.filter(([effect]) => QUIRK_NUMBER[effect] === undefined);
  const line = active.map(([effect, percent]) => `${percent > 0 ? "+" : "−"}${Math.abs(percent)}% ${text.effects[effect]}`).join(", ");
  if (inactive.length === 0) return line;
  return `${line || text.noActiveQuirk} ${text.inactiveEffects(inactive.map(([effect]) => text.effects[effect]).join(", "))}`;
}

/** Seconds as m:ss. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Russian noun form for a count: 1 золотой, 2 золотых, 5 золотых. */
function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}
