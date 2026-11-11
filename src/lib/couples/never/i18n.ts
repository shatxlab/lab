import type { Lang } from "../types";
const en = {
  rules: "Read a statement together. Each person answers whether they HAVE done it or NEVER have — the negative wording can be tricky! Answers are visible to both of you. Share a story only if you feel like it, then move on. Either person can skip a card, even after an answer: both answers are cleared. No points, drinking, or explanations owed.",
  deck: "Choose your cards", mix: "A little of both", mixHint: "Everyday fun + stories. Personal cards excluded.",
  light: "Everyday fun", lightHint: "Little mishaps, quirks, and familiar moments.",
  stories: "Story time", storiesHint: "Adventures, detours, and stories worth telling.",
  closer: "A little closer", closerHint: "Gentle feelings and affection. Only if you both want to — skipping is always fine.",
  consent: "Both choose the deck together. You can skip anything without saying why.",
  count: "Cards this round", have: "I have", never: "Never", answers: "Your answers", answered: "Both answered — story time?", answerHint: "Each tap answers for that person. You can change it before moving on.",
  optional: "Optional conversation starter", skip: "Skip this card", next: "Next card", finish: "Finish round",
  summary: "Thanks for the stories", explored: "Cards explored", skipped: "Cards skipped", closing: "No score, no comparison. Keep the stories between you.",
  privacy: "Answers and stories are never saved. No effect on question-game stats. Reloading ends the round.",
  cardLanguage: "Cards stay in the language selected when this round started.",
};
type NeverStrings = Record<keyof typeof en, string>;
const ru: NeverStrings = {
  rules: "Прочитайте фразу вместе. Каждый отвечает, БЫЛО ли такое или НИКОГДА не было — не запутайтесь в отрицании! Ответы видны вам обоим. Делитесь историей, только если хочется, и переходите дальше. Любой может пропустить карточку даже после ответа: оба ответа исчезнут. Без очков, алкоголя и обязанности объясняться.",
  deck: "Выберите карточки", mix: "Всего понемногу", mixHint: "Бытовые забавности и истории. Без личных карточек.",
  light: "Жизненные мелочи", lightHint: "Неловкости, привычки и знакомые каждому ситуации.",
  stories: "Есть история", storiesHint: "Приключения, случайности и поводы что-нибудь вспомнить.",
  closer: "Чуть ближе", closerHint: "Нежность, симпатия и немного уязвимости. Только если вам обоим хочется; пропускать можно всё.",
  consent: "Выберите набор вдвоём. Любую карточку можно пропустить без объяснений.",
  count: "Карточек в раунде", have: "Было", never: "Никогда", answers: "Ваши ответы", answered: "Оба ответили — поделимся историями?", answerHint: "Каждый отвечает за себя. До следующей карточки ответ можно изменить.",
  optional: "Если хочется обсудить", skip: "Пропустить карточку", next: "Следующая карточка", finish: "Завершить раунд",
  summary: "Спасибо за истории", explored: "Карточек обсудили", skipped: "Карточек пропустили", closing: "Без очков и сравнений. Пусть истории останутся между вами.",
  privacy: "Ответы и истории не сохраняются. Статистика игр с вопросами не меняется. Перезагрузка завершит раунд.",
  cardLanguage: "Карточки остаются на языке, выбранном в начале раунда.",
};
export function neverStrings(lang: Lang): NeverStrings { return lang === "ru" ? ru : en; }
