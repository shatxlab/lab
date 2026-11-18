/** Local calendar day as an integer, so "tomorrow" follows the user's midnight. */
export function localDay(date: Date = new Date()): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}
