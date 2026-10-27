import type { AppLang } from "@/lib/apps/lang";
import { pluralRu } from "@/lib/apps/i18n";
import type { Choice, EventKind } from "./sim/types";
import type { Level } from "./meta";

export interface FootballText {
  title: string;
  tagline: string;
  howTo: string[];
  home: string;
  kickOff: string;
  chooseKit: string;
  chooseOpponent: string;
  levels: Record<Level, { name: string; description: string }>;
  record: (won: number, drawn: number, lost: number) => string;
  kitNames: string[];
  homeName: string;
  rivalNames: string[];
  minute: (minute: number) => string;
  watching: string;
  rotateTitle: string;
  rotateBody: string;
  landscapeNote: string;
  /** One line of the match feed, for an event and the man it's about. */
  feedLabel: string;
  feed: (kind: EventKind, name: string) => string;
  pause: string;
  paused: string;
  resume: string;
  speed: string;
  leave: string;
  yourCall: string;
  choice: (choice: Choice, name: string) => string;
  letThemDecide: string;
  goal: (name: string) => string;
  won: string;
  drawn: string;
  lost: string;
  scorers: string;
  noScorers: string;
  statNames: { shots: string; onTarget: string; chances: string; possession: string; passes: string; tackles: string };
  playAgain: string;
  menu: string;
  fieldLabel: string;
  momentLabel: string;
}

const pct = (value: number): string => `${Math.round(value * 100)}%`;

export const FOOTBALL_TEXT: Record<AppLang, FootballText> = {
  en: {
    title: "Sunday League",
    tagline: "Eight-a-side pixel football. Your lads play the match; you make the calls that decide it.",
    howTo: [
      "Your side plays on its own. When it gets the ball in a dangerous place, the game stops and it's your call.",
      "Pick a shot, a pass to a teammate, or running on with the ball. The numbers are your odds.",
      "On a phone, tap a button or a teammate. On a keyboard, press 1 to 5, or Space to let the lads decide.",
    ],
    home: "Home",
    kickOff: "Kick off",
    chooseKit: "Your colours",
    chooseOpponent: "Today's opponent",
    levels: {
      park: { name: "Park lads", description: "Pub-team legs, big hearts. Good for a first game." },
      league: { name: "League side", description: "As good as your own lot. Anything can happen." },
      derby: { name: "The derby", description: "The local rivals, in better boots than yours." },
    },
    record: (won, drawn, lost) => `W${won} D${drawn} L${lost}`,
    kitNames: ["Reds", "Blues", "Greens", "Oranges", "Purples", "Whites", "Yellows", "Blacks"],
    homeName: "Lab Rovers",
    rivalNames: ["Dockside Utd", "Red Lane FC", "Old Mill", "Northgate", "Union Wharf", "Hill Park", "Canal Town", "Foxhollow"],
    minute: (minute) => `${minute}'`,
    rotateTitle: "Turn your phone sideways",
    rotateBody: "Matches are played in landscape: the pitch needs the width. The game is paused until you turn it.",
    landscapeNote: "Matches are played with the screen turned sideways.",
    feedLabel: "Match feed",
    watching: "Watch the match. You get the call when the lads win the ball up the pitch.",
    feed: (kind, name) =>
      ({
        goal: `Goal! ${name}`,
        save: `Great save by ${name}`,
        miss: `${name} shoots wide`,
        tackle: `${name} wins the ball`,
        intercept: `${name} cuts out the pass`,
        block: `${name} blocks the shot`,
        half: "",
        full: "",
      })[kind],
    pause: "Pause",
    paused: "Paused",
    resume: "Resume",
    speed: "Game speed",
    leave: "Leave the match",
    yourCall: "Your call",
    choice: (choice, name) => {
      const odds = pct(choice.chance);
      if (choice.kind === "shoot") return `Shoot · ${odds}`;
      if (choice.kind === "pass") return `Pass to ${name} · ${odds}`;
      return `Run with it · ${odds}`;
    },
    letThemDecide: "Space: let the lads decide",
    goal: (name) => `GOAL! ${name}`,
    won: "Full time: a win!",
    drawn: "Full time: honours even",
    lost: "Full time: a defeat",
    scorers: "Goals",
    noScorers: "No goals",
    statNames: { shots: "Shots", onTarget: "On target", chances: "Chances (xG)", possession: "Possession", passes: "Passes completed", tackles: "Tackles won" },
    playAgain: "Play again",
    menu: "Menu",
    fieldLabel: "The pitch. When the game stops for your call, tap a teammate to pass to him, or use the buttons or number keys. Space lets the team decide.",
    momentLabel: "Choose what the man on the ball does",
  },
  ru: {
    title: "Воскресная лига",
    tagline: "Пиксельный футбол «восемь на восемь». Ребята играют сами, а решающие моменты решаете вы.",
    howTo: [
      "Ваша команда играет сама. Когда она получает мяч в опасном месте, игра останавливается, и решение за вами.",
      "Выберите удар, передачу партнёру или рывок с мячом. Числа — это ваши шансы.",
      "На телефоне коснитесь кнопки или партнёра. С клавиатуры — клавиши 1–5, а пробел отдаёт решение ребятам.",
    ],
    home: "На главную",
    kickOff: "Начать матч",
    chooseKit: "Цвета команды",
    chooseOpponent: "Соперник на сегодня",
    levels: {
      park: { name: "Парковые ребята", description: "Ноги как у любителей, сердца большие. Для первой игры." },
      league: { name: "Команда лиги", description: "Не слабее вашей. Всё может случиться." },
      derby: { name: "Дерби", description: "Местные соперники, и бутсы у них лучше." },
    },
    record: (won, drawn, lost) => `В${won} Н${drawn} П${lost}`,
    kitNames: ["Красные", "Синие", "Зелёные", "Оранжевые", "Фиолетовые", "Белые", "Жёлтые", "Чёрные"],
    homeName: "Лаб Роверс",
    rivalNames: ["Доксайд", "Ред Лейн", "Старая мельница", "Нортгейт", "Юнион Уорф", "Хилл Парк", "Канал-Таун", "Фокс Холлоу"],
    minute: (minute) => `${minute}'`,
    rotateTitle: "Поверните телефон",
    rotateBody: "Матчи играются в горизонтальном положении: полю нужна ширина. Игра на паузе, пока вы не повернёте экран.",
    landscapeNote: "Матчи играются с экраном, повёрнутым горизонтально.",
    feedLabel: "Ход матча",
    watching: "Смотрите матч. Решение за вами, когда ребята заберут мяч ближе к чужим воротам.",
    feed: (kind, name) =>
      ({
        goal: `Гол! ${name}`,
        save: `Отличный сейв: ${name}`,
        miss: `${name} бьёт мимо`,
        tackle: `${name} отбирает мяч`,
        intercept: `${name} перехватывает передачу`,
        block: `${name} блокирует удар`,
        half: "",
        full: "",
      })[kind],
    pause: "Пауза",
    paused: "Пауза",
    resume: "Продолжить",
    speed: "Скорость игры",
    leave: "Покинуть матч",
    yourCall: "Ваше решение",
    choice: (choice, name) => {
      const odds = pct(choice.chance);
      if (choice.kind === "shoot") return `Удар · ${odds}`;
      if (choice.kind === "pass") return `Пас: ${name} · ${odds}`;
      return `Рывок с мячом · ${odds}`;
    },
    letThemDecide: "Пробел: пусть решат ребята",
    goal: (name) => `ГОЛ! ${name}`,
    won: "Матч окончен: победа!",
    drawn: "Матч окончен: ничья",
    lost: "Матч окончен: поражение",
    scorers: "Голы",
    noScorers: "Голов нет",
    statNames: { shots: "Удары", onTarget: "В створ", chances: "Моменты (xG)", possession: "Владение", passes: "Точные передачи", tackles: "Отборы" },
    playAgain: "Сыграть ещё",
    menu: "Меню",
    fieldLabel:
      "Поле. Когда игра останавливается для вашего решения, коснитесь партнёра, чтобы отдать ему пас, или используйте кнопки и цифровые клавиши. Пробел отдаёт решение команде.",
    momentLabel: "Выберите, что сделает игрок с мячом",
  },
};

/** How many goals, for the screen reader's summary. */
export function goalsLabel(lang: AppLang, count: number): string {
  return lang === "ru" ? `${count} ${pluralRu(count, "гол", "гола", "голов")}` : `${count} ${count === 1 ? "goal" : "goals"}`;
}
