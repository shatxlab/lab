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
  | "chooseLanguage"
  | "theme"
  | "chooseTheme"
  | "teams"
  | "teamsHint"
  | "teamPlaceholder"
  | "addTeam"
  | "removeTeam"
  | "roundTime"
  | "secondsSuffix"
  | "targetScore"
  | "pointsSuffix"
  | "skipPenalty"
  | "skipPenaltyHint"
  | "sound"
  | "soundOn"
  | "soundOff"
  | "startGame"
  | "newGame"
  | "rulesTitle"
  | "ruleOne"
  | "ruleTwo"
  | "ruleThree"
  | "ruleFour"
  | "wordsInDeck"
  | "getReady"
  | "readyTeam"
  | "readyHint"
  | "explainerHint"
  | "startRound"
  | "firstTeam"
  | "correct"
  | "skip"
  | "finishRound"
  | "exit"
  | "confirmExit"
  | "confirmExitBody"
  | "confirm"
  | "cancel"
  | "time"
  | "round"
  | "scoreboard"
  | "roundOver"
  | "turnPoints"
  | "guessed"
  | "skipped"
  | "noWords"
  | "nextTeam"
  | "seeResults"
  | "gameOver"
  | "winner"
  | "finalScores"
  | "playAgain"
  | "backToSetup"
  | "pointsShort"
  | "scoreToWin"
  | "skipShort"
  | "keyboardHint"
  | "timeUpHint"
  | "mute"
  | "unmute"
  | "close";

const STRINGS: Record<Lang, Record<StringKey, string>> = {
  en: {
    appName: "Alias",
    tagline: "Describe the word — your team has to guess it before time runs out.",
    language: "Language",
    chooseLanguage: "Pick a language before you start.",
    theme: "Theme",
    chooseTheme: "Choose your word theme",
    teams: "Teams",
    teamsHint: "Add two or more teams. Play passes the device to the explainer each turn.",
    teamPlaceholder: "Team name",
    addTeam: "Add team",
    removeTeam: "Remove team",
    roundTime: "Round time",
    secondsSuffix: "s",
    targetScore: "Play to",
    pointsSuffix: "pts",
    skipPenalty: "Skip penalty",
    skipPenaltyHint: "Points lost for each skipped word.",
    sound: "Sound",
    soundOn: "On",
    soundOff: "Off",
    startGame: "Start game",
    newGame: "New game",
    rulesTitle: "How to play",
    ruleOne: "One player is the explainer and holds the device.",
    ruleTwo: "Describe the word without saying it, its parts or its translation.",
    ruleThree: "Your team guesses out loud. Tap Guessed for +1, Skip for a penalty.",
    ruleFour: "Score the most points before the timer ends each turn. First to the target wins.",
    wordsInDeck: "Words in this deck",
    getReady: "Get ready",
    readyTeam: "Team {team}",
    readyHint: "Pass the device to the explainer. Only they should see the word.",
    explainerHint: "Tap start, then describe the first word. No saying the word itself!",
    startRound: "Start round",
    firstTeam: "Team {team} starts",
    correct: "Guessed",
    skip: "Skip",
    finishRound: "Finish round",
    exit: "Exit",
    confirmExit: "Leave the game?",
    confirmExitBody: "The current scores will be lost.",
    confirm: "Leave",
    cancel: "Cancel",
    time: "Time",
    round: "Round",
    scoreboard: "Scoreboard",
    roundOver: "Time is up!",
    turnPoints: "This turn",
    guessed: "Guessed",
    skipped: "Skipped",
    noWords: "No words this turn.",
    nextTeam: "Next team",
    seeResults: "See results",
    gameOver: "Game over",
    winner: "Team {team} wins!",
    finalScores: "Final scores",
    playAgain: "Play again",
    backToSetup: "Back to setup",
    pointsShort: "pts",
    scoreToWin: "to win",
    skipShort: "skips",
    keyboardHint: "Keyboard: Space = guessed · Backspace = skip",
    timeUpHint: "Time is up — mark the last word to finish.",
    mute: "Mute sound",
    unmute: "Unmute sound",
    close: "Close",
  },
  ru: {
    appName: "Алиас",
    tagline: "Объясните слово — команда должна угадать его, пока не вышло время.",
    language: "Язык",
    chooseLanguage: "Выберите язык до начала игры.",
    theme: "Тема",
    chooseTheme: "Выберите тему слов",
    teams: "Команды",
    teamsHint: "Добавьте две или больше команд. Устройство передаётся объясняющему.",
    teamPlaceholder: "Название команды",
    addTeam: "Добавить команду",
    removeTeam: "Удалить команду",
    roundTime: "Длительность раунда",
    secondsSuffix: "с",
    targetScore: "Играем до",
    pointsSuffix: "очк.",
    skipPenalty: "Штраф за пропуск",
    skipPenaltyHint: "Сколько очков отнимать за пропущенное слово.",
    sound: "Звук",
    soundOn: "Вкл",
    soundOff: "Выкл",
    startGame: "Начать игру",
    newGame: "Новая игра",
    rulesTitle: "Как играть",
    ruleOne: "Один игрок становится объясняющим и держит устройство.",
    ruleTwo: "Объясняйте слово, не называя его, его части и перевод.",
    ruleThree: "Команда угадывает вслух. «Угадали» — +1, «Пропуск» — штраф.",
    ruleFour: "Наберите больше очков за раунд. Кто первым дойдёт до цели — победил.",
    wordsInDeck: "Слов в колоде",
    getReady: "Приготовьтесь",
    readyTeam: "Команда «{team}»",
    readyHint: "Передайте устройство объясняющему. Слово должен видеть только он.",
    explainerHint: "Нажмите «Начать» и объясняйте первое слово. Само слово называть нельзя!",
    startRound: "Начать раунд",
    firstTeam: "Начинает команда «{team}»",
    correct: "Угадали",
    skip: "Пропуск",
    finishRound: "Завершить раунд",
    exit: "Выйти",
    confirmExit: "Выйти из игры?",
    confirmExitBody: "Текущие очки будут потеряны.",
    confirm: "Выйти",
    cancel: "Отмена",
    time: "Время",
    round: "Раунд",
    scoreboard: "Табло",
    roundOver: "Время вышло!",
    turnPoints: "За раунд",
    guessed: "Угадано",
    skipped: "Пропущено",
    noWords: "В этом раунде слов не было.",
    nextTeam: "Следующая команда",
    seeResults: "К результатам",
    gameOver: "Игра окончена",
    winner: "Победила команда «{team}»!",
    finalScores: "Итоговые очки",
    playAgain: "Играть снова",
    backToSetup: "К настройкам",
    pointsShort: "очк.",
    scoreToWin: "до победы",
    skipShort: "проп.",
    keyboardHint: "Клавиши: Пробел — угадали · Backspace — пропуск",
    timeUpHint: "Время вышло — отметьте последнее слово, чтобы завершить.",
    mute: "Выключить звук",
    unmute: "Включить звук",
    close: "Закрыть",
  },
};

export type TranslationKey = StringKey;

/** Translate a key, interpolating `{placeholders}` from `vars`. */
export function t(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
