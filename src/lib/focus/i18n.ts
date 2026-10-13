import { createTranslator } from "@/lib/apps/i18n";
import type { AppLang } from "@/lib/apps/lang";

export const tz = createTranslator({
  en: {
    title: "Focus office",
    tagline: "Run a small office on Pomodoros. Finish the day's quota and everyone stays; give up and someone packs their box.",

    planTitle: "Plan your day",
    hours: "Hours to work",
    custom: "Customize lengths",
    focusMin: "Focus (minutes)",
    shortMin: "Short break (minutes)",
    longMin: "Long break (minutes)",
    longEvery: "Long break every … Pomodoros",
    planSummary: "{n} Pomodoros, about {time}",
    planNone: "That is too short for even one Pomodoro.",
    stakes: "Each Pomodoro you give up costs someone their job.",
    open: "Open the office",
    sound: "Sound",

    phaseReady: "Ready when you are",
    phaseFocus: "Focus",
    phaseBreak: "Break",
    phaseLong: "Long break",
    phaseDone: "Day complete",
    progress: "Pomodoro {n} of {total}",
    timer: "Time left",
    start: "Start",
    pause: "Pause",
    resume: "Resume",
    skipBreak: "Skip break",
    giveUp: "Give up this Pomodoro",
    endDay: "End the day",
    focusMode: "Focus mode",
    exitFocusMode: "Exit focus mode",
    dots: "Pomodoros: {done} done, {missed} given up, {left} to go",
    tapped: "{name}, {role}",
    sceneFailed: "The office could not be drawn here. The timer still works.",
    team: "Team",

    giveUpTitle: "Give up this Pomodoro?",
    giveUpBody: "{name} will pack a box and leave.",
    keepFocusing: "Keep focusing",
    giveUpYes: "Give up",
    endTitle: "End the day now?",
    endBody: "Pomodoros you have not played count as given up. People who will lose their job: {n}.",
    endYes: "End it now",

    winTitle: "Everyone stays",
    winBody: "All {n} Pomodoros done, {min} minutes of focus.",
    loseTitle: "People left today",
    loseBody: "Pomodoros done: {done} of {total}. Gone: {names}.",
    newDay: "Start a new day",

    history: "History",
    historyEmpty: "No days yet. Your first finished day will show up here.",
    statStreak: "Day streak",
    statFull: "Full days",
    statFocused: "Focused",
    statLost: "People lost",
    record: "{done} of {total} done, {min} min",
    stayed: "Everyone stayed",
    left: "Left: {names}",
    roleDesigner: "Designer",
    roleDeveloper: "Developer",
    roleTester: "Tester",
    hoursUnit: "h",
    minutesUnit: "min",
  },
  ru: {
    title: "Офис фокуса",
    tagline: "Управляйте маленьким офисом с помощью Помодоро. Выполните норму дня — и все остаются; бросите — кто-то соберёт вещи в коробку.",

    planTitle: "План на день",
    hours: "Часов работы",
    custom: "Настроить длину",
    focusMin: "Фокус (минут)",
    shortMin: "Короткий перерыв (минут)",
    longMin: "Длинный перерыв (минут)",
    longEvery: "Длинный перерыв каждые … помодоро",
    planSummary: "Помодоро: {n}, примерно {time}",
    planNone: "Этого мало даже для одного помодоро.",
    stakes: "Каждый брошенный помодоро стоит кому-то работы.",
    open: "Открыть офис",
    sound: "Звук",

    phaseReady: "Начинайте, когда готовы",
    phaseFocus: "Фокус",
    phaseBreak: "Перерыв",
    phaseLong: "Длинный перерыв",
    phaseDone: "День завершён",
    progress: "Помодоро {n} из {total}",
    timer: "Осталось",
    start: "Старт",
    pause: "Пауза",
    resume: "Продолжить",
    skipBreak: "Пропустить перерыв",
    giveUp: "Бросить этот помодоро",
    endDay: "Закончить день",
    focusMode: "Режим фокуса",
    exitFocusMode: "Выйти из режима фокуса",
    dots: "Помодоро: сделано {done}, брошено {missed}, осталось {left}",
    tapped: "{name}, {role}",
    sceneFailed: "Здесь не удалось нарисовать офис. Таймер работает.",
    team: "Команда",

    giveUpTitle: "Бросить этот помодоро?",
    giveUpBody: "{name} соберёт вещи в коробку и уйдёт.",
    keepFocusing: "Продолжить работу",
    giveUpYes: "Бросить",
    endTitle: "Закончить день сейчас?",
    endBody: "Несыгранные помодоро считаются брошенными. Лишатся работы: {n}.",
    endYes: "Закончить сейчас",

    winTitle: "Все остаются",
    winBody: "Все помодоро сделаны: {n}, минут фокуса: {min}.",
    loseTitle: "Сегодня кто-то ушёл",
    loseBody: "Сделано помодоро: {done} из {total}. Ушли: {names}.",
    newDay: "Начать новый день",

    history: "История",
    historyEmpty: "Пока нет дней. Первый завершённый день появится здесь.",
    statStreak: "Дней подряд",
    statFull: "Полных дней",
    statFocused: "В фокусе",
    statLost: "Уволено",
    record: "Сделано {done} из {total}, минут: {min}",
    stayed: "Все остались",
    left: "Ушли: {names}",
    roleDesigner: "Дизайнер",
    roleDeveloper: "Разработчик",
    roleTester: "Тестировщик",
    hoursUnit: "ч",
    minutesUnit: "мин",
  },
});

/** "3 h 35 min", "45 min", "2 h" — in the user's language. */
export function formatMinutes(lang: AppLang, minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const h = tz(lang, "hoursUnit");
  const m = tz(lang, "minutesUnit");
  if (hours === 0) return `${rest} ${m}`;
  return rest === 0 ? `${hours} ${h}` : `${hours} ${h} ${rest} ${m}`;
}

/** "24:05" for a countdown. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The calendar day number as a localized date. */
export function formatDay(lang: AppLang, day: number): string {
  const date = new Date(day * 86_400_000 + new Date().getTimezoneOffset() * 60_000);
  return date.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
}
