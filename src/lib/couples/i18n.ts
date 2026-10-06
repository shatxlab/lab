/**
 * UI copy. «Игры для пар» ships Russian-only, so every string lives in one
 * typed object instead of a locale map.
 */
export const TXT = {
  appName: "Игры для пар",
  tagline: "Три игры, которые расскажут, насколько вы совпадаете",

  // Menu
  menuTitle: "Выберите игру",
  menuSubtitle: "Два игрока, один телефон и пачка вопросов. Отвечайте по очереди — и смотрите, совпали ли.",
  cardNew: "Новая игра",
  open: "Играть",

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
} as const;

export type TextKey = keyof typeof TXT;

/** Translate a key, interpolating `{name}` placeholders. */
export function t(key: TextKey, vars?: Record<string, string | number>): string {
  const template = TXT[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function turnLabel(name: string): string {
  return `${TXT.turn}: ${name}`;
}

export function passBody(name: string): string {
  return t("passBody", { name });
}

export function passButton(name: string): string {
  return t("passButton", { name });
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
export function verdictFor(ratio: number): string {
  if (ratio >= 0.9) return TXT.summaryMatchPerfect;
  if (ratio >= 0.65) return TXT.summaryMatchGreat;
  if (ratio >= 0.4) return TXT.summaryMatchOkay;
  return TXT.summaryMatchLow;
}
