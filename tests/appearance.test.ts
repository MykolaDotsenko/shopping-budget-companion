import { describe, expect, it } from "vitest";

import {
  APPEARANCE_STORAGE_KEY,
  appearanceThemeColor,
  applyAppearanceToDocument,
  parseAppearanceMode,
  persistAppearancePreference,
  readAppearancePreference,
  resolvedAppearance,
  type AppearanceStorage,
} from "../src/app/appearance";

describe("appearance preference", () => {
  it("fails closed to system for missing or invalid values", () => {
    expect(parseAppearanceMode(null)).toBe("system");
    expect(parseAppearanceMode("unknown")).toBe("system");
    expect(parseAppearanceMode("aurora")).toBe("aurora");
  });

  it("resolves system appearance without changing explicit modes", () => {
    expect(resolvedAppearance("system", false)).toBe("light");
    expect(resolvedAppearance("system", true)).toBe("dark");
    expect(resolvedAppearance("light", true)).toBe("light");
    expect(resolvedAppearance("aurora", false)).toBe("aurora");
  });

  it("treats storage failures as convenience-only failures", () => {
    const storage: AppearanceStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readAppearancePreference(storage)).toBe("system");
    expect(persistAppearancePreference("dark", storage)).toBe(false);
  });

  it("persists a valid explicit preference", () => {
    const values = new Map<string, string>();
    const storage: AppearanceStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };

    expect(persistAppearancePreference("aurora", storage)).toBe(true);
    expect(values.get(APPEARANCE_STORAGE_KEY)).toBe("aurora");
    expect(readAppearancePreference(storage)).toBe("aurora");
  });

  it("uses the calibrated dark browser chrome color", () => {
    expect(appearanceThemeColor("dark", false)).toBe("#0f1210");
    expect(appearanceThemeColor("system", true)).toBe("#0f1210");
  });

  it("uses the calibrated Aurora browser chrome color", () => {
    expect(appearanceThemeColor("aurora", false)).toBe("#050611");
  });

  it("resolves System to a concrete document theme", () => {
    applyAppearanceToDocument("system", document, true);

    expect(document.documentElement.dataset.appearance).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("updates document appearance and browser theme color together", () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#ffffff" />';

    applyAppearanceToDocument("dark", document, false);

    expect(document.documentElement.dataset.appearance).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    ).toBe(appearanceThemeColor("dark", false));
  });
});
