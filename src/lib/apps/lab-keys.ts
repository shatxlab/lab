/**
 * The key prefix every lab app stores under, and the `epub-reader:`
 * exception that predates the convention. The site shares an origin with
 * other projects, so only these keys are ever read, written, removed or
 * mirrored.
 */
export const KEY_PATTERN = /^(lab:|epub-reader:)/;

export function isLabKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** All lab keys currently in a storage (snapshot, safe to mutate storage after). */
export function labKeys(
  storage: Pick<Storage, "length" | "key" | "getItem">,
): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isLabKey(key)) keys.push(key);
  }
  return keys.sort();
}
