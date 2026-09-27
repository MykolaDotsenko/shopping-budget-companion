import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

const persistLanguage = (language: AppLanguage): boolean => {
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

const interpolate = (
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string =>
  template.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );

interface I18nContextValue {
  readonly language: AppLanguage;
  readonly locale: string;
  readonly changing: boolean;
  readonly saveFailed: boolean;
  readonly t: (
    source: string,
    values?: Readonly<Record<string, string | number>>,
  ) => string;
  readonly tp: (
    oneSource: string,
    otherSource: string,
    count: number,
    values?: Readonly<Record<string, string | number>>,
  ) => string;
  readonly setLanguage: (language: AppLanguage) => Promise<void>;
}

const englishContext: I18nContextValue = {
  language: "en",
  locale: LOCALES.en,
  changing: false,
  saveFailed: false,
  t: (source, values) => interpolate(source, values),
  tp: (oneSource, otherSource, count, values) =>
    interpolate(count === 1 ? oneSource : otherSource, {
      count,
      ...values,
    }),
  setLanguage: async () => undefined,
};

const I18nContext = createContext<I18nContextValue>(englishContext);

export interface I18nProviderProps {
  readonly initialLanguage: AppLanguage;
  readonly initialCatalog: MessageCatalog;
  readonly children: ReactNode;
}

export function I18nProvider({
  initialLanguage,
  initialCatalog,
  children,
}: I18nProviderProps) {
  const [state, setState] = useState(() => ({
    language: initialLanguage,
    catalog: initialCatalog,
  }));
  const [changing, setChanging] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const value = useMemo<I18nContextValue>(() => {
    const t = (
      source: string,
      values?: Readonly<Record<string, string | number>>,
    ): string => {
      const translated = state.catalog[source];

      return interpolate(
        typeof translated === "string" ? translated : source,
        values,
      );
    };

    const tp = (
      oneSource: string,
      otherSource: string,
      count: number,
      values?: Readonly<Record<string, string | number>>,
    ): string => {
      const translated = state.catalog[oneSource];
      let template = count === 1 ? oneSource : otherSource;

      if (typeof translated === "object" && translated !== null) {
        const category = new Intl.PluralRules(
          LOCALES[state.language],
        ).select(count);
        template =
          translated[category] ??
          translated.other ??
          translated.one ??
          template;
      } else if (typeof translated === "string") {
        template = translated;
      }

      return interpolate(template, { count, ...values });
    };

    const setLanguage = async (language: AppLanguage): Promise<void> => {
      if (language === state.language) {
        return;
      }

      setChanging(true);

      try {
        const catalog = await loadLanguageCatalog(language);
        document.documentElement.lang = language;
        setSaveFailed(!persistLanguage(language));
        setState({ language, catalog });
      } finally {
        setChanging(false);
      }
    };

    return {
      language: state.language,
      locale: LOCALES[state.language],
      changing,
      saveFailed,
      t,
      tp,
      setLanguage,
    };
  }, [changing, saveFailed, state]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = (): I18nContextValue => useContext(I18nContext);
