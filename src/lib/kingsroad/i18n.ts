import type { AppLang } from "@/lib/apps/lang";
import type { Blurb, Stat } from "@/lib/tower/i18n";
import { BURN, MARK, type TowerLevel } from "./sim/balance";
import type { ArcherBranch, CanvasId, FoeKind, MapId, TowerKind } from "./sim/types";

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
  continueRun: string;
  continueHint: (map: string, wave: number, total: number) => string;
  continuePaused: string;
  discardRun: string;
  discardRunConfirm: string;
  replaceRunConfirm: string;
  saveAndMenu: string;
  saveUnavailable: string;
  retrySave: string;
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
  wavePreview: (wave: number) => string;
  previewTotal: (count: number) => string;
  previewDetails: string;
  previewPaused: string;
  previewScheduled: string;
  noUpcomingWave: string;
  enemyGuide: string;
  guideHint: string;
  combatRules: string;
  foes: Record<FoeKind, Blurb>;
  flyingFoe: string;
  foeLeak: (count: number) => string;
  armorRule: (armor: number, floor: number) => string;
  fireproofRule: (share: number) => string;
  shieldRule: (cap: number) => string;
  healerRule: (rate: number, range: number) => string;
  summonRule: (count: number, seconds: number) => string;
  airTargetRule: (air: string, ground: string) => string;
  targetingRule: string;
  frostRule: (seconds: number) => string;
  burnRule: (dps: number, seconds: number) => string;
  markRule: (bonus: number, seconds: number) => string;
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
    continueRun: "Continue run",
    continueHint: (map, wave, total) => `${map} · Wave ${wave}/${total}`,
    continuePaused: "Continues paused, at normal speed. No time passes while away.",
    discardRun: "Discard saved run",
    discardRunConfirm: "Discard this unfinished run? Campaign stars will be kept.",
    replaceRunConfirm: "Start a new run and discard the unfinished one? Campaign stars will be kept.",
    saveAndMenu: "Save & menu",
    saveUnavailable: "Saving is unavailable. Keep this tab open: reloading may lose progress. A win must be saved before starting another run.",
    retrySave: "Retry saving",
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
    wavePreview: (wave) => `Next wave ${wave}`,
    previewTotal: (count) => `${count} ${count === 1 ? "enemy" : "enemies"}`,
    previewDetails: "Details",
    previewPaused: "Paused while you read. Resume when you are ready to return to the road.",
    previewScheduled: "New scheduled arrivals only; enemies already on the field remain, and warlord summons are extra. Column order and roads are randomized when the wave starts.",
    noUpcomingWave: "No more waves scheduled.",
    enemyGuide: "Enemy guide",
    guideHint: "Tap an enemy to read its traits and ways to counter it. The guide covers this map, not only the next wave.",
    combatRules: "Damage & targeting",
    foes: {
      grunt: { name: "Footman", description: "Marches in a ground column. Catapult splash can catch a group; frost buys more firing time." },
      runner: { name: "Runner", description: "Fast with little health. Rapid archer hits and frost can help cover gaps in the defense." },
      brute: { name: "Brute", description: "Slow but durable. Upgrade damage and keep it under fire; frost extends the time in range." },
      bat: { name: "Bat", description: "Prepare air-capable towers along its flight path, especially near the gate." },
      boss: { name: "Warlord", description: "A slow, very tough ground enemy. Keep damage and slowing coverage on its route, and leave room to handle its reinforcements." },
      knight: { name: "Knight", description: "Plate takes a larger share out of small hits. Heavier hits lose a smaller share; Fire-arrow burning bypasses armor." },
      imp: { name: "Imp", description: "Use ordinary arrows, Lune arrows, or non-fire attacks instead of relying on Fire arrows. Frost still slows it." },
      healer: { name: "Healer", description: "Walks among the footmen. Aim the volley at the healer and its escort; towers select their own targets, so you cannot command them to focus it." },
      scamp: { name: "Scamp", description: "Tiny, fast ground swarms. Catapult splash, frost, and a well-placed volley can catch several together." },
      gargoyle: { name: "Gargoyle", description: "An armored flyer. Use air-capable towers; heavier hits or Fire-arrow burning help against its armor." },
      bulwark: { name: "Shieldbearer", description: "Carries a tower shield that bounds any single hit. Rapid archer fire, frost and Fire-arrow burning wear it down; heavy shots waste themselves on the shield." },
    },
    flyingFoe: "Flies toward the gate, ignoring roads. Ground-only attacks cannot hit it.",
    foeLeak: (count) => `Costs ${count} ${count === 1 ? "life" : "lives"} if it reaches the gate.`,
    armorRule: (armor, floor) => `Armor subtracts ${EN.num(armor)} damage from each direct hit, but at least ${EN.pct(floor)} of that hit gets through. Burning ignores armor.`,
    fireproofRule: (share) => `Immune to burning. A Fire arrow's impact does only ${EN.pct(share)} of its normal damage; fire immunity does not reduce other attacks.`,
    shieldRule: (cap) => `Tower shield: no single hit deals more than ${EN.num(cap)} damage. Burning ticks are not hits, so fire keeps its full effect.`,
    healerRule: (rate, range) => `Restores ${EN.pct(rate)} of nearby allies' maximum health per second within ${EN.num(range)} range. Cannot heal itself or warlords; it can heal other healers and flyers.`,
    summonRule: (count, seconds) => `Summons ${count} extra footmen every ${EN.num(seconds)} s while alive. These reinforcements are not included in the scheduled count.`,
    airTargetRule: (air, ground) => `Can target flyers: ${air}. Ground only: ${ground}. Volley arrows can hit both ground and flying enemies near their landing spots.`,
    targetingRule: "Towers automatically target in-range enemies nearest the gate along their routes. Frost prefers enemies whose slow is absent or about to wear off. You aim the volley, not individual towers.",
    frostRule: (seconds) => `Frost slows for ${EN.num(seconds)} s. Hits refresh the duration; the strongest applied slow wins rather than stacking.`,
    burnRule: (dps, seconds) => `Fire arrows burn for ${EN.num(dps)} damage/s for ${EN.num(seconds)} s, ignoring armor. Hits refresh burning rather than stacking it; fireproof foes do not burn.`,
    markRule: (bonus, seconds) => `Lune marks last ${EN.num(seconds)} s and increase damage taken by ${EN.pct(bonus)}, including burning. Marks refresh rather than stacking.`,
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
    continueRun: "Продолжить забег",
    continueHint: (map, wave, total) => `${map} · Волна ${wave}/${total}`,
    continuePaused: "Продолжение на паузе, с обычной скоростью. В отсутствие игрока время не идёт.",
    discardRun: "Удалить сохранённый забег",
    discardRunConfirm: "Удалить незавершённый забег? Звёзды кампании сохранятся.",
    replaceRunConfirm: "Начать новый забег и удалить незавершённый? Звёзды кампании сохранятся.",
    saveAndMenu: "Сохранить и в меню",
    saveUnavailable: "Сохранение недоступно. Не закрывайте вкладку: перезагрузка может привести к потере прогресса. Перед новым забегом нужно сохранить победу.",
    retrySave: "Повторить сохранение",
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
    wavePreview: (wave) => `Следующая волна: ${wave}`,
    previewTotal: (count) => `${count} ${plural(count, "враг", "врага", "врагов")}`,
    previewDetails: "Подробнее",
    previewPaused: "Пока вы читаете, игра на паузе. Нажмите «Продолжить», когда будете готовы вернуться к дороге.",
    previewScheduled: "Только новые враги по расписанию: уже вышедшие остаются на поле, а призванные полководцем сюда не входят. Порядок колонн и дороги выбираются случайно при старте волны.",
    noUpcomingWave: "Новых волн больше не будет.",
    enemyGuide: "Справочник врагов",
    guideHint: "Коснитесь врага, чтобы узнать его свойства и способы противодействия. Здесь все типы на этой карте, а не только в следующей волне.",
    combatRules: "Урон и выбор целей",
    foes: {
      grunt: { name: "Пехотинец", description: "Идёт наземной колонной. Катапульта может накрыть группу, а лёд даёт башням больше времени для стрельбы." },
      runner: { name: "Бегун", description: "Быстрый, но с небольшим запасом здоровья. Частые выстрелы лучников и замедление помогают закрыть пробелы в обороне." },
      brute: { name: "Громила", description: "Медленный, но живучий. Улучшайте урон и держите его под огнём; лёд продлевает время в радиусе башен." },
      bat: { name: "Летучая мышь", description: "Расставляйте башни с воздушной атакой вдоль её полёта, особенно у ворот." },
      boss: { name: "Полководец", description: "Медленный и очень живучий наземный враг. Нужны урон и замедление вдоль его пути, а также оборона против подкреплений." },
      knight: { name: "Рыцарь", description: "Латы отнимают большую долю слабого удара. Сильные попадания теряют меньшую долю, а горение от огненных стрел обходит броню." },
      imp: { name: "Бес", description: "Используйте обычные или лунные стрелы и неогненные атаки, не полагаясь на огненные стрелы. Лёд по-прежнему замедляет его." },
      healer: { name: "Лекарь", description: "Идёт среди пехоты. Направьте залп на лекаря и его сопровождение: башни выбирают цели сами, приказать им сосредоточить огонь нельзя." },
      scamp: { name: "Бесёнок", description: "Мелкий быстрый наземный рой. Катапульта, лёд и удачно направленный залп могут накрыть сразу нескольких." },
      gargoyle: { name: "Горгулья", description: "Летающий враг с бронёй. Нужны башни с воздушной атакой; против брони помогают сильные попадания или горение от огненных стрел." },
      bulwark: { name: "Щитоносец", description: "Несёт башенный щит, ограничивающий любой одиночный удар. Частые стрелы лучников, мороз и горение от огненных стрел изматывают его; тяжёлые выстрелы теряются о щит." },
    },
    flyingFoe: "Летит к воротам, игнорируя дороги. Наземные атаки её не достают.",
    foeLeak: (count) => `Отнимает ${count} ${plural(count, "жизнь", "жизни", "жизней")}, если доберётся до ворот.`,
    armorRule: (armor, floor) => `Броня вычитает ${RU.num(armor)} урона из каждого прямого попадания, но пропускает не менее ${RU.pct(floor)} его урона. Горение игнорирует броню.`,
    fireproofRule: (share) => `Не горит. Само попадание огненной стрелы наносит лишь ${RU.pct(share)} обычного урона; огнеупорность не ослабляет остальные атаки.`,
    shieldRule: (cap) => `Башенный щит: один удар наносит не больше ${RU.num(cap)} урона. Тики горения — не удары, огонь действует полностью.`,
    healerRule: (rate, range) => `Восстанавливает союзникам ${RU.pct(rate)} от их максимального здоровья в секунду в радиусе ${RU.num(range)}. Не лечит себя и полководцев, но лечит других лекарей и летающих врагов.`,
    summonRule: (count, seconds) => `Пока жив, призывает ещё ${count} пехотинцев каждые ${RU.num(seconds)} с. Эти подкрепления не входят в число врагов по расписанию.`,
    airTargetRule: (air, ground) => `Бьют летающих врагов: ${air}. Только наземных: ${ground}. Стрелы залпа бьют наземных и летающих врагов рядом с местом падения.`,
    targetingRule: "Башни сами выбирают доступную цель, которой осталось меньше всего пути до ворот. Ледяной маг предпочитает врагов без замедления или с истекающим замедлением. Игрок направляет залп, но не выстрелы отдельных башен.",
    frostRule: (seconds) => `Лёд замедляет на ${RU.num(seconds)} с. Попадания обновляют время; действует самое сильное наложенное замедление, а не сумма эффектов.`,
    burnRule: (dps, seconds) => `Огненные стрелы поджигают на ${RU.num(seconds)} с: ${RU.num(dps)} урона в секунду сквозь броню. Попадания обновляют горение, а не складывают его; огнеупорные враги не горят.`,
    markRule: (bonus, seconds) => `Лунная метка действует ${RU.num(seconds)} с и увеличивает получаемый урон на ${RU.pct(bonus)}, включая горение. Метки обновляются, а не складываются.`,
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
