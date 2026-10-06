import { afterEach, describe, expect, it, vi } from "vitest";
import { persistTheme, readStoredTheme, resolveTheme, THEME_STORAGE_KEY } from "@/lib/apps/theme";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("utility theme persistence", () => {
  it("resolves stored themes before system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("reads and persists valid theme values", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };

    expect(readStoredTheme(storage)).toBeNull();
    persistTheme("dark", storage);

    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "dark");
    expect(readStoredTheme(storage)).toBe("dark");
  });

  it("treats corrupt or unavailable storage as unset", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage disabled");
      },
    });

    expect(readStoredTheme()).toBeNull();
    expect(() => persistTheme("dark")).not.toThrow();
  });

  it("does not throw when an injected storage implementation fails", () => {
    const brokenStorage = {
      getItem: vi.fn(() => {
        throw new Error("cannot read");
      }),
      setItem: vi.fn(() => {
        throw new Error("cannot write");
      }),
      removeItem: vi.fn(),
    };

    expect(readStoredTheme(brokenStorage)).toBeNull();
    expect(() => persistTheme("light", brokenStorage)).not.toThrow();
  });
});
