import { createTranslator } from "@/lib/apps/i18n";

export const tz = createTranslator({
  en: {
    title: "Focus office",
    tagline: "A Pomodoro timer with stakes, and lo-fi to work to. Stay with the flow and everyone stays; give a Pomodoro up and someone packs their box.",
    loading: "Opening the office…",

    phaseReady: "Ready when you are",
    phaseFocus: "Focus",
    phaseBreak: "Break",
    phaseLong: "Long break",
    timer: "Time left",
    start: "Start",
    pause: "Pause",
    resume: "Resume",
    skipBreak: "Skip break",
    giveUp: "Give up this Pomodoro",
    leave: "Leave",
    fullScreen: "Full screen",
    exitFullScreen: "Exit full screen",
    flowNote: "25 minutes of focus, 5 of rest, and a 15 minute break after every fourth.",
    doneCount: "Pomodoros done: {n}",
    dots: "This round: {done} done, {missed} given up",
    tapped: "{name}, {role}",
    sceneFailed: "The office could not be drawn here. The timer still works.",
    team: "Team",

    music: "Music",
    mute: "Mute music and sounds",
    unmute: "Unmute music and sounds",
    volume: "Music volume",
    musicBlocked: "Tap anywhere to start the music.",
    musicNote: "Generated here as you listen: no stream, no download.",

    giveUpTitle: "Give up this Pomodoro?",
    giveUpBody: "{name} will pack a box and leave.",
    keepFocusing: "Keep focusing",
    giveUpYes: "Give up",

    emptyTitle: "The office is empty",
    emptyBody: "Everyone has left. You finished {n} Pomodoros, {min} minutes of focus.",
    hire: "Hire a new team",
    roleDesigner: "Designer",
    roleDeveloper: "Developer",
    roleTester: "Tester",
  },
  ru: {
    title: "Офис фокуса",
    tagline: "Таймер помодоро со ставками и лоуфай для работы. Держитесь потока — и все остаются; бросите помодоро — кто-то соберёт вещи в коробку.",
    loading: "Открываю офис…",

    phaseReady: "Начинайте, когда готовы",
    phaseFocus: "Фокус",
    phaseBreak: "Перерыв",
    phaseLong: "Длинный перерыв",
    timer: "Осталось",
    start: "Старт",
    pause: "Пауза",
    resume: "Продолжить",
    skipBreak: "Пропустить перерыв",
    giveUp: "Бросить этот помодоро",
    leave: "Выйти",
    fullScreen: "Во весь экран",
    exitFullScreen: "Выйти из полного экрана",
    flowNote: "25 минут фокуса, 5 минут отдыха и 15 минут после каждого четвёртого.",
    doneCount: "Сделано помодоро: {n}",
    dots: "В этом круге: сделано {done}, брошено {missed}",
    tapped: "{name}, {role}",
    sceneFailed: "Здесь не удалось нарисовать офис. Таймер работает.",
    team: "Команда",

    music: "Музыка",
    mute: "Выключить музыку и звуки",
    unmute: "Включить музыку и звуки",
    volume: "Громкость музыки",
    musicBlocked: "Нажмите в любом месте, чтобы включить музыку.",
    musicNote: "Создаётся здесь, пока вы слушаете: без потока и без загрузки.",

    giveUpTitle: "Бросить этот помодоро?",
    giveUpBody: "{name} соберёт вещи в коробку и уйдёт.",
    keepFocusing: "Продолжить работу",
    giveUpYes: "Бросить",

    emptyTitle: "Офис опустел",
    emptyBody: "Все ушли. Вы сделали помодоро: {n}, минут фокуса: {min}.",
    hire: "Нанять новую команду",
    roleDesigner: "Дизайнер",
    roleDeveloper: "Разработчик",
    roleTester: "Тестировщик",
  },
});

/** "24:05" for a countdown. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
