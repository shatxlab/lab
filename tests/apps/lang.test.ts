// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  APP_LANG_EVENT,
  changeAppLang,
  readAppLang,
  subscribeToAppLang,
} from "@/lib/apps/lang";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("global language setting", () => {
  it("defaults to English when nothing is stored", () => {
    expect(readAppLang(fakeStorage())).toBe("en");
    expect(readAppLang(undefined)).toBe("en");
  });

  it("reads the shared key", () => {
    expect(readAppLang(fakeStorage({ "lab:lang": "ru" }))).toBe("ru");
    expect(readAppLang(fakeStorage({ "lab:lang": "de" }))).toBe("en");
  });

  it("migrates the legacy per-app choices once", () => {
    expect(readAppLang(fakeStorage({ "lab:crossword:lang": "ru" }))).toBe("ru");
    const alias = fakeStorage({ "lab:alias:v1": JSON.stringify({ settings: { lang: "ru" } }) });
    expect(readAppLang(alias)).toBe("ru");
    const couples = fakeStorage({ "lab:couples:v1": JSON.stringify({ settings: { lang: "ru" } }) });
    expect(readAppLang(couples)).toBe("ru");
    // The global key wins over any legacy key.
    expect(
      readAppLang(fakeStorage({ "lab:lang": "en", "lab:crossword:lang": "ru" })),
    ).toBe("en");
  });

  it("persists changes and notifies subscribers plus other islands", () => {
    const storage = fakeStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeToAppLang(listener);
    const domListener = vi.fn();
    window.addEventListener(APP_LANG_EVENT, domListener);

    changeAppLang("ru", storage);

    expect(storage.getItem("lab:lang")).toBe("ru");
    expect(listener).toHaveBeenCalledWith("ru");
    expect(domListener).toHaveBeenCalledTimes(1);
    expect((domListener.mock.calls[0]?.[0] as CustomEvent).detail).toBe("ru");
    // The document language follows the setting.
    expect(document.documentElement.lang).toBe("ru");

    unsubscribe();
    changeAppLang("en", storage);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(APP_LANG_EVENT, domListener);
  });
});
