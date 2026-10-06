import type { Lang } from "./types";

export const LANGS: readonly Lang[] = ["en", "ru"];

export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  ru: "Русский",
};

export const LANG_SHORT: Record<Lang, string> = {
  en: "EN",
  ru: "RU",
};

type StringKey =
  | "appName"
  | "tagline"
  | "language"
  // Menu
  | "menuTitle"
  | "menuSubtitle"
  | "cardNew"
  | "open"
  | "statsLine"
  // Setup
  | "setupTitle"
  | "names"
  | "namesHint"
  | "nameOne"
  | "nameTwo"
  | "mode"
  | "modeMatch"
  | "modeTogether"
  | "modeMatchHint"
  | "modeTogetherHint"
  | "theme"
  | "themeAll"
  | "themes"
  | "themeHint"
  | "count"
  | "cards"
  | "countHint"
  | "sound"
  | "soundOn"
  | "soundOff"
  | "startGame"
  | "back"
  | "deckCount"
  // Play
  | "turn"
  | "passTitle"
  | "passBody"
  | "passButton"
  | "question"
  | "chipNorm"
  | "chipCringe"
  | "revealMatch"
  | "revealNoMatch"
  | "revealMatchNote"
  | "revealNoMatchNote"
  | "next"
  | "finish"
  | "exit"
  | "confirmExit"
  | "confirmExitBody"
  | "confirm"
  | "cancel"
  | "close"
  | "keyboardHint"
  | "mute"
  | "unmute"
  // Summary
  | "summaryMatchTitle"
  | "summaryTogetherTitle"
  | "summaryMatchPerfect"
  | "summaryMatchGreat"
  | "summaryMatchOkay"
  | "summaryMatchLow"
  | "summaryMatched"
  | "summaryCards"
  | "summaryTopChoice"
  | "summaryPlayAgain"
  | "summarySettings"
  | "summaryMenu"
  | "summaryNewQuestions"
  | "summaryChose";

const STRINGS: Record<Lang, Record<StringKey, string>> = {
  en: {
    appName: "Games for Couples",
    tagline: "Three games that show how much you match",
    language: "Language",

    // Menu
    menuTitle: "Pick a game",
    menuSubtitle:
      "Two players, one phone and a stack of questions. Answer in turns — and see whether you matched.",
    cardNew: "New game",
    open: "Play",
    statsLine: "Games played: {games} · Cards: {cards} · Matches: {percent}%",

    // Setup
    setupTitle: "Set up the game",
    names: "What are your names?",
    namesHint: "Names are needed for “Who of Us” and for whose turn it is.",
    nameOne: "First name",
    nameTwo: "Second name",
    mode: "How to play",
    modeMatch: "On score",
    modeTogether: "Together",
    modeMatchHint: "Answer in secret, passing the phone. At the end — your match percentage.",
    modeTogetherHint: "Discuss out loud and pick one shared answer.",
    theme: "Theme",
    themeAll: "All themes",
    themes: "themes",
    themeHint: "Each theme holds 300 questions.",
    count: "How many cards",
    cards: "cards",
    countHint: "Enough for one evening. You can always start over with new questions.",
    sound: "Sound",
    soundOn: "On",
    soundOff: "Off",
    startGame: "Start game",
    back: "Back",
    deckCount: "{count} questions in the deck",

    // Play
    turn: "Answering",
    passTitle: "Pass the phone",
    passBody: "Now {name} answers. The other player should look away.",
    passButton: "I'm {name}, show it",
    question: "Question",
    chipNorm: "Fine",
    chipCringe: "Cringe",
    revealMatch: "Matched!",
    revealNoMatch: "No match",
    revealMatchNote: "You answered the same",
    revealNoMatchNote: "You answered differently",
    next: "Next",
    finish: "To the results",
    exit: "Exit",
    confirmExit: "Leave the game?",
    confirmExitBody: "The current progress will be lost.",
    confirm: "Leave",
    cancel: "Cancel",
    close: "Close",
    keyboardHint: "Keyboard: 1 and 2 — pick an answer · Space — next",
    mute: "Mute sound",
    unmute: "Unmute sound",

    // Summary
    summaryMatchTitle: "Your match percentage",
    summaryTogetherTitle: "Your results",
    summaryMatchPerfect: "You read each other like an open book!",
    summaryMatchGreat: "A great match — you know each other well.",
    summaryMatchOkay: "There is plenty to argue about and discuss.",
    summaryMatchLow: "Looks like you complement each other perfectly.",
    summaryMatched: "Matches",
    summaryCards: "Cards",
    summaryTopChoice: "Most often you picked",
    summaryPlayAgain: "Again with new questions",
    summarySettings: "Change settings",
    summaryMenu: "To the menu",
    summaryNewQuestions: "New questions",
    summaryChose: "You picked",
  },
  ru: {
    appName: "Игры для пар",
    tagline: "Три игры, которые расскажут, насколько вы совпадаете",
    language: "Язык",

    // Menu
    menuTitle: "Выберите игру",
    menuSubtitle: "Два игрока, один телефон и пачка вопросов. Отвечайте по очереди — и смотрите, совпали ли.",
    cardNew: "Новая игра",
    open: "Играть",
    statsLine: "Игр сыграно: {games} · Карточек: {cards} · Совпадений: {percent}%",

    // Setup
    setupTitle: "Настройте игру",
    names: "Как вас зовут?",
    namesHint: "Имена нужны для игры «Кто из нас» и для хода игроков.",
    nameOne: "Имя первого",
    nameTwo: "Имя второго",
    mode: "Как играем",
    modeMatch: "На счёт",
    modeTogether: "Вместе",
    modeMatchHint: "Отвечаете тайно, передавая телефон. В конце — процент совпадений.",
    modeTogetherHint: "Обсуждаете вслух и выбираете один общий ответ.",
    theme: "Тема",
    themeAll: "Все темы",
    themes: "темы",
    themeHint: "В каждой теме по 300 вопросов.",
    count: "Сколько карточек",
    cards: "карточек",
    countHint: "Хватит на один вечер. Можно начать заново с новыми вопросами.",
    sound: "Звук",
    soundOn: "Вкл",
    soundOff: "Выкл",
    startGame: "Начать игру",
    back: "Назад",
    deckCount: "{count} вопросов в колоде",

    // Play
    turn: "Отвечает",
    passTitle: "Передайте телефон",
    passBody: "Теперь отвечает {name}. Пусть второй игрок отвернётся.",
    passButton: "Я {name}, показать",
    question: "Вопрос",
    chipNorm: "Норм",
    chipCringe: "Стрём",
    revealMatch: "Совпали!",
    revealNoMatch: "Не совпали",
    revealMatchNote: "Вы ответили одинаково",
    revealNoMatchNote: "Вы ответили по-разному",
    next: "Дальше",
    finish: "К итогам",
    exit: "Выйти",
    confirmExit: "Выйти из игры?",
    confirmExitBody: "Текущий прогресс не сохранится.",
    confirm: "Выйти",
    cancel: "Отмена",
    close: "Закрыть",
    keyboardHint: "Клавиши: 1 и 2 — выбрать ответ · Пробел — дальше",
    mute: "Выключить звук",
    unmute: "Включить звук",

    // Summary
    summaryMatchTitle: "Ваш процент совпадений",
    summaryTogetherTitle: "Ваши итоги",
    summaryMatchPerfect: "Вы читаете друг друга как открытую книгу!",
    summaryMatchGreat: "Отличное совпадение — вы хорошо знаете друг друга.",
    summaryMatchOkay: "Есть о чём поспорить и что обсудить.",
    summaryMatchLow: "Похоже, вы отлично дополняете друг друга.",
    summaryMatched: "Совпадений",
    summaryCards: "Карточек",
    summaryTopChoice: "Чаще всего выбирали",
    summaryPlayAgain: "Ещё раз с новыми вопросами",
    summarySettings: "Изменить настройки",
    summaryMenu: "К меню",
    summaryNewQuestions: "Новые вопросы",
    summaryChose: "Выбрали",
  },
};

export type TranslationKey = StringKey;

export type TXT = Record<StringKey, string>;

/** All UI strings for one language, for `TXT[lang].key` access. */
export function stringsFor(lang: Lang): TXT {
  return STRINGS[lang];
}

/** Translate a key, interpolating `{placeholders}` from `vars`. */
export function t(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function turnLabel(lang: Lang, name: string): string {
  return `${STRINGS[lang].turn}: ${name}`;
}

export function passBody(lang: Lang, name: string): string {
  return t(lang, "passBody", { name });
}

export function passButton(lang: Lang, name: string): string {
  return t(lang, "passButton", { name });
}

export function cardCounter(index: number, total: number): string {
  return `${index} / ${total}`;
}

export function matchScore(matched: number, total: number): string {
  return `${matched} / ${total}`;
}

export function percentText(percent: number): string {
  return `${percent}%`;
}

/** A friendly verdict based on the match ratio (0–1). */
export function verdictFor(lang: Lang, ratio: number): string {
  if (ratio >= 0.9) return STRINGS[lang].summaryMatchPerfect;
  if (ratio >= 0.65) return STRINGS[lang].summaryMatchGreat;
  if (ratio >= 0.4) return STRINGS[lang].summaryMatchOkay;
  return STRINGS[lang].summaryMatchLow;
}
