export type AppLanguage = "en" | "fi" | "uk";
type PluralCategory = Intl.LDMLPluralRule;

export type MessageValue =
  | string
  | Readonly<Partial<Record<PluralCategory, string>>>;

export type MessageCatalog = Readonly<Record<string, MessageValue>>;

const LANGUAGE_STORAGE_KEY = "shopping-budget:language";

export const APP_LANGUAGES = Object.freeze(["en", "fi", "uk"] as const);

const LOCALES: Readonly<Record<AppLanguage, string>> = {
  en: "en-FI",
  fi: "fi-FI",
  uk: "uk-UA",
};

const NATIVE_NAMES: Readonly<Record<AppLanguage, string>> = {
  en: "English",
  fi: "Suomi",
  uk: "Українська",
};

const isLanguage = (value: string | null | undefined): value is AppLanguage =>
  value === "en" || value === "fi" || value === "uk";

const browserLanguage = (): AppLanguage => {
  if (typeof navigator === "undefined") {
    return "en";
  }

  for (const candidate of navigator.languages ?? [navigator.language]) {
    const primary = candidate.toLowerCase().split("-")[0];

    if (primary === "fi" || primary === "uk") {
      return primary;
    }
  }

  return "en";
};

export const readLanguagePreference = (): AppLanguage => {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);

    if (isLanguage(stored)) {
      return stored;
    }
  } catch {
    // Language persistence is convenience-only.
  }

  return browserLanguage();
};

export const persistLanguage = (language: AppLanguage): boolean => {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
    return true;
  } catch {
    return false;
  }
};

export const localeForLanguage = (language: AppLanguage): string =>
  LOCALES[language];

export const languageName = (language: AppLanguage): string =>
  NATIVE_NAMES[language];

export const loadLanguageCatalog = async (
  language: AppLanguage,
): Promise<MessageCatalog> => {
  switch (language) {
    case "fi":
      return (await import("./locales/locale-fi")).messages;
    case "uk":
      return (await import("./locales/locale-uk")).messages;
    case "en":
      return {};
    default: {
      const exhaustive: never = language;
      return exhaustive;
    }
  }
};

export const interpolate = (
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string =>
  template.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
