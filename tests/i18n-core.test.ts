import { afterEach, describe, expect, it, vi } from "vitest";

import {
  localeForLanguage,
  persistLanguage,
  readLanguagePreference,
} from "../src/app/i18n-core";
import { decimalAmountPlaceholder } from "../src/features/shopping/shopping-locale";

const setLanguages = (languages: readonly string[]) => {
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    value: languages,
  });
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: languages[0] ?? "en-US",
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  setLanguages(["en-US"]);
});

describe("i18n core", () => {
  it("prefers a persisted supported language over browser detection", () => {
    setLanguages(["fi-FI"]);
    window.localStorage.setItem("shopping-budget:language", "uk");

    expect(readLanguagePreference()).toBe("uk");
  });

  it("detects Finnish and Ukrainian from browser language priority", () => {
    setLanguages(["sv-FI", "fi-FI", "en-US"]);
    expect(readLanguagePreference()).toBe("fi");

    setLanguages(["pl-PL", "uk-UA", "en-US"]);
    expect(readLanguagePreference()).toBe("uk");
  });

  it("falls back to English for unsupported browser languages", () => {
    setLanguages(["sv-FI", "de-DE"]);
    expect(readLanguagePreference()).toBe("en");
  });

  it("still detects the browser language when local storage reads fail", () => {
    setLanguages(["fi-FI"]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(readLanguagePreference()).toBe("fi");
  });

  it("reports preference persistence failures without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(persistLanguage("uk")).toBe(false);
  });

  it("maps languages to the expected formatting locales", () => {
    expect(localeForLanguage("en")).toBe("en-FI");
    expect(localeForLanguage("fi")).toBe("fi-FI");
    expect(localeForLanguage("uk")).toBe("uk-UA");
  });

  it("formats decimal input examples using each locale separator", () => {
    expect(decimalAmountPlaceholder("en-FI", 50)).toBe("50,00");
    expect(decimalAmountPlaceholder("fi-FI", 50)).toBe("50,00");
    expect(decimalAmountPlaceholder("uk-UA", 50)).toBe("50,00");
  });
});
